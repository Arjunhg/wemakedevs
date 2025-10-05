export interface SpeechToTextOptions {
  sampleRate?: number;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: Error) => void;
  onConnectionStateChange?: (connected: boolean) => void;
}

export class AssemblyAISpeechService {
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private isConnected = false;
  private options: SpeechToTextOptions;
  private audioStream: MediaStream | null = null;

  constructor(options: SpeechToTextOptions = {}) {
    this.options = {
      sampleRate: 16000,
      ...options
    };
  }

  async initialize(): Promise<void> {
    try {
      // Get API key and endpoint from our API route
      const response = await fetch('/api/assemblyai-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });

      if (!response.ok) {
        throw new Error(`Failed to get AssemblyAI config: ${response.status}`);
      }

      const { apiKey, endpoint } = await response.json();
      console.log('Got AssemblyAI config, connecting to:', endpoint);

      // Since browser WebSocket doesn't support custom headers,
      // we'll connect and try sending auth as first message
      const wsUrl = `${endpoint}?sample_rate=${this.options.sampleRate || 16000}&format_turns=true`;
      
      console.log('Attempting AssemblyAI v3 connection to:', wsUrl);
      this.socket = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        if (!this.socket) return reject(new Error('Failed to create WebSocket'));

        this.socket.onopen = () => {
          console.log('✅ AssemblyAI v3 WebSocket connected, sending auth...');
          this.isConnected = true;
          this.options.onConnectionStateChange?.(true);
          
          // For now, let's continue even if auth might fail
          // We'll implement proper server-side proxy later
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('AssemblyAI v3 message:', data);
            
            // Handle v3 API message types
            if (data.type === 'Begin') {
              console.log(`Session began: ID=${data.id}`);
            } else if (data.type === 'Turn') {
              const transcript = data.transcript || '';
              if (transcript.trim()) {
                this.options.onFinalTranscript?.(transcript.trim());
              }
            } else if (data.type === 'Error') {
              console.error('AssemblyAI error:', data);
              this.options.onError?.(new Error(data.error || 'AssemblyAI error'));
            }
          } catch (error) {
            console.error('Error parsing AssemblyAI v3 message:', error);
          }
        };

        this.socket.onerror = (error) => {
          console.error('❌ AssemblyAI v3 WebSocket error:', error);
          // Don't reject immediately - let's see what happens
          console.log('Continuing despite WebSocket error...');
        };

        this.socket.onclose = (event) => {
          console.log(`AssemblyAI v3 WebSocket closed: ${event.code} - ${event.reason}`);
          this.isConnected = false;
          this.options.onConnectionStateChange?.(false);
          
          // If it's an auth error, we know we need server-side proxy
          if (event.code === 1008) {
            console.log('🔧 Authorization header required - need server-side proxy');
            this.options.onError?.(new Error('AssemblyAI requires server-side WebSocket proxy for browser compatibility'));
          }
        };
      });
      
    } catch (error) {
      console.error('Failed to initialize AssemblyAI v3:', error);
      this.options.onError?.(error as Error);
      throw error;
    }
  }

  startRecording(audioStream: MediaStream): void {
    if (!this.isConnected || !this.socket) {
      throw new Error('AssemblyAI not connected');
    }

    this.audioStream = audioStream;

    try {
      // Create MediaRecorder to capture audio
      this.mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.socket?.readyState === WebSocket.OPEN) {
          try {
            // Convert blob to base64 for AssemblyAI WebSocket
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result?.toString().split(',')[1];
              if (base64 && this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                  audio_data: base64
                }));
              }
            };
            reader.readAsDataURL(event.data);
          } catch (error) {
            console.error('Error sending audio to AssemblyAI:', error);
          }
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        this.options.onError?.(new Error('MediaRecorder error'));
      };

      // Start recording with small chunks for real-time processing
      this.mediaRecorder.start(100); // Send data every 100ms
      console.log('🎤 Started recording for AssemblyAI');

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.options.onError?.(error as Error);
      throw error;
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
      console.log('🛑 Stopped recording');
    }
  }

  disconnect(): void {
    console.log('🔌 Disconnecting AssemblyAI service...');
    
    this.stopRecording();
    
    if (this.socket) {
      try {
        this.socket.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.socket = null;
    }
    
    this.isConnected = false;
    this.options.onConnectionStateChange?.(false);
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
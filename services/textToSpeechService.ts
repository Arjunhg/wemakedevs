export interface TextToSpeechOptions {
  voiceId?: string;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: Error) => void;
}

export class MurfTextToSpeechService {
  private audioElement: HTMLAudioElement;
  private options: TextToSpeechOptions;
  private isSpeaking = false;

  constructor(audioElement: HTMLAudioElement, options: TextToSpeechOptions = {}) {
    this.audioElement = audioElement;
    this.options = {
      voiceId: 'en-US-josh',
      ...options
    };

    this.setupAudioElement();
  }

  private setupAudioElement(): void {
    this.audioElement.addEventListener('play', () => {
      this.isSpeaking = true;
      this.options.onSpeechStart?.();
    });

    this.audioElement.addEventListener('ended', () => {
      this.isSpeaking = false;
      this.options.onSpeechEnd?.();
    });

    this.audioElement.addEventListener('error', (event) => {
      this.isSpeaking = false;
      this.options.onError?.(new Error('Audio playback error'));
    });

    this.audioElement.addEventListener('pause', () => {
      this.isSpeaking = false;
      this.options.onSpeechEnd?.();
    });
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) {
      throw new Error('Text cannot be empty');
    }

    try {
      // Stop any current speech
      if (this.isSpeaking) {
        this.stop();
      }

      const response = await fetch('/api/murf-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          voiceId: this.options.voiceId
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.audioData) {
        throw new Error('No audio data returned from TTS service');
      }

      // Convert base64 to blob URL for audio playback
      const audioBlob = this.base64ToBlob(data.audioData, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);

      // Load and play the audio
      return new Promise((resolve, reject) => {
        const handleCanPlay = () => {
          this.audioElement.removeEventListener('canplay', handleCanPlay);
          this.audioElement.removeEventListener('error', handleError);
          
          this.audioElement.play()
            .then(() => resolve())
            .catch(reject);
        };

        const handleError = () => {
          this.audioElement.removeEventListener('canplay', handleCanPlay);
          this.audioElement.removeEventListener('error', handleError);
          reject(new Error('Failed to load audio'));
        };

        // Clean up previous blob URL
        if (this.audioElement.src.startsWith('blob:')) {
          URL.revokeObjectURL(this.audioElement.src);
        }

        this.audioElement.addEventListener('canplay', handleCanPlay);
        this.audioElement.addEventListener('error', handleError);
        
        this.audioElement.src = audioUrl;
        this.audioElement.load();
      });
    } catch (error) {
      this.options.onError?.(error as Error);
      throw error;
    }
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  stop(): void {
    if (this.isSpeaking) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  setVoice(voiceId: string): void {
    this.options.voiceId = voiceId;
  }

  dispose(): void {
    this.stop();
    this.audioElement.src = '';
  }
}
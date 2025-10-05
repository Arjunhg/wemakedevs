'use client'
import { api } from '@/convex/_generated/api';
import { useConvex, useMutation } from 'convex/react';
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useState, useRef } from 'react'
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { InterviewData, MessageType } from '@/types/Types';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneCall, PhoneOff, User, Bot } from 'lucide-react';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SimplifiedInterview = () => {
  const { interviewId } = useParams();
  const convex = useConvex();
  const router = useRouter();

  const [interviewData, setInterviewData] = useState<InterviewData>();
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [assemblySocket, setAssemblySocket] = useState<WebSocket | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const updateFeedback = useMutation(api.Interview.UpdateFeedback);

  // Get interview data
  const getInterviewQuestions = async () => {
    if (!interviewId || Array.isArray(interviewId)) {
      toast.error("Invalid interview ID");
      throw new Error("Invalid interview ID");
    }
    
    const result = await convex.query(api.Interview.GetInterviewQuestions, { 
      interviewRecordId: interviewId as Id<"InterviewSessionTable"> 
    });

    if (result) {
      // Cast to proper type based on whether resumeUrl exists
      if (result.resumeUrl) {
        const resumeInterview: InterviewData = {
          ...result,
          type: 'resume',
          resumeUrl: result.resumeUrl
        };
        setInterviewData(resumeInterview);
      } else {
        const manualInterview: InterviewData = {
          ...result,
          type: 'manual'
        };
        setInterviewData(manualInterview);
      }
    }
  };

  // Initialize AssemblyAI streaming
  const initializeAssemblyAI = async () => {
    try {
      const response = await axios.post('/api/assemblyai-stream', { action: 'start' });
      const { token, endpoint } = response.data;

      const socket = new WebSocket(`${endpoint}?token=${token}`);
      
      socket.onopen = () => {
        console.log('AssemblyAI connected');
        setIsConnected(true);
        
        // Send configuration
        socket.send(JSON.stringify({
          sample_rate: 16000,
          format_turns: true,
          enable_extra_session_information: true
        }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.message_type === 'PartialTranscript') {
          setCurrentTranscript(data.text);
        } else if (data.message_type === 'FinalTranscript') {
          setCurrentTranscript('');
          if (data.text && data.text.trim()) {
            handleUserResponse(data.text.trim());
          }
        }
      };

      socket.onerror = (error) => {
        console.error('AssemblyAI error:', error);
        toast.error('Transcription service error');
      };

      socket.onclose = () => {
        console.log('AssemblyAI disconnected');
        setIsConnected(false);
      };

      setAssemblySocket(socket);
    } catch (error) {
      console.error('Failed to initialize AssemblyAI:', error);
      toast.error('Failed to connect to transcription service');
    }
  };

  // Handle user response and generate AI reply
  const handleUserResponse = async (userText: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      const currentQuestion = interviewData?.interviewQuestions[currentQuestionIndex];
      
      const response = await axios.post('/api/conversation', {
        userTranscript: userText,
        currentQuestion: currentQuestion?.question,
        interviewQuestions: interviewData?.interviewQuestions,
        conversationHistory
      });

      const { aiResponse, conversationHistory: newHistory, nextQuestionIndex, isComplete } = response.data;
      
      setConversationHistory(newHistory);
      
      if (nextQuestionIndex !== -1) {
        setCurrentQuestionIndex(nextQuestionIndex);
      }

      // Generate speech for AI response
      await generateSpeech(aiResponse);

      if (isComplete) {
        // End interview
        setTimeout(() => {
          finishInterview(newHistory);
        }, 3000);
      }
    } catch (error) {
      console.error('Error processing conversation:', error);
      toast.error('Failed to process response');
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate speech using Murf AI
  const generateSpeech = async (text: string) => {
    try {
      const response = await axios.post('/api/murf-tts', {
        text,
        voiceId: 'en-US-josh'
      });

      if (response.data.audioUrl && audioRef.current) {
        audioRef.current.src = response.data.audioUrl;
        audioRef.current.play();
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      toast.error('Failed to generate speech');
    }
  };

  // Start/stop recording
  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          } 
        });

        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && assemblySocket?.readyState === WebSocket.OPEN) {
            // Convert to base64 and send to AssemblyAI
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result?.toString().split(',')[1];
              if (base64) {
                assemblySocket.send(JSON.stringify({
                  audio_data: base64
                }));
              }
            };
            reader.readAsDataURL(event.data);
          }
        };

        recorder.start(100); // Send data every 100ms
        setMediaRecorder(recorder);
        setIsRecording(true);
        toast.success('Recording started');
      } catch (error) {
        console.error('Error starting recording:', error);
        toast.error('Failed to start recording');
      }
    } else {
      if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        setMediaRecorder(null);
      }
      setIsRecording(false);
      toast.success('Recording stopped');
    }
  };

  // Start interview
  const startInterview = async () => {
    if (!interviewData?.interviewQuestions?.length) {
      toast.error('No interview questions available');
      return;
    }

    await initializeAssemblyAI();
    
    // Give a brief moment for connection, then start with greeting
    setTimeout(async () => {
      const greeting = `Hello! Welcome to your interview. I'm excited to learn more about you. Let's start with our first question: ${interviewData.interviewQuestions[0].question}`;
      await generateSpeech(greeting);
      
      setConversationHistory([{
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toISOString()
      }]);
    }, 1000);
  };

  // Finish interview and generate feedback
  const finishInterview = async (finalHistory: ConversationEntry[]) => {
    try {
      // Stop recording if active
      if (isRecording) {
        toggleRecording();
      }

      // Close AssemblyAI connection
      if (assemblySocket) {
        assemblySocket.close();
      }

      // Generate feedback using the interview feedback API
      const feedbackResponse = await axios.post('/api/interview-feedback', {
        conversation: finalHistory,
        interviewQuestions: interviewData?.interviewQuestions
      });

      // Update feedback in database
      await updateFeedback({
        recordId: interviewId as Id<"InterviewSessionTable">,
        feedback: feedbackResponse.data.feedback || {
          feedback: 'Interview completed successfully',
          rating: 8,
          suggestion: 'Great job on completing the interview!'
        }
      });

      toast.success('Interview completed! Redirecting to feedback...');
      router.push(`/interview/${interviewId}`);
    } catch (error) {
      console.error('Error finishing interview:', error);
      toast.error('Error saving interview results');
    }
  };

  useEffect(() => {
    getInterviewQuestions();
  }, [interviewId]);

  if (!interviewData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading interview questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <h1 className="text-2xl font-bold">Live Interview Session</h1>
            <p className="opacity-90">Question {currentQuestionIndex + 1} of {interviewData.interviewQuestions.length}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 p-6">
            {/* Left side - AI Avatar area */}
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-8 text-center min-h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <Bot className="w-24 h-24 mx-auto text-blue-500 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">AI Interviewer</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    {isProcessing ? 'Processing your response...' : 'Ready to interview'}
                  </p>
                  {isConnected && (
                    <div className="mt-4 flex items-center justify-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-600">Connected</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center space-x-4">
                {!isConnected ? (
                  <Button 
                    onClick={startInterview}
                    className="bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    <PhoneCall className="w-4 h-4 mr-2" />
                    Start Interview
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={toggleRecording}
                      variant={isRecording ? "destructive" : "default"}
                      size="lg"
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="w-4 h-4 mr-2" />
                          Stop Speaking
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 mr-2" />
                          Start Speaking
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => finishInterview(conversationHistory)}
                      variant="outline"
                      size="lg"
                    >
                      <PhoneOff className="w-4 h-4 mr-2" />
                      End Interview
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Right side - Conversation log */}
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 h-[400px] overflow-y-auto">
                <h3 className="font-semibold mb-4">Live Conversation</h3>
                
                {/* Current transcript */}
                {currentTranscript && (
                  <div className="mb-4 p-3 bg-blue-50 rounded border-l-4 border-blue-500">
                    <p className="text-sm text-blue-700 font-medium">You're saying:</p>
                    <p className="text-blue-800">{currentTranscript}</p>
                  </div>
                )}

                {/* Conversation history */}
                <div className="space-y-3">
                  {conversationHistory.map((entry, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        entry.role === 'user'
                          ? 'bg-green-50 border-l-4 border-green-500'
                          : 'bg-gray-100 border-l-4 border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        {entry.role === 'user' ? (
                          <User className="w-4 h-4 text-green-600" />
                        ) : (
                          <Bot className="w-4 h-4 text-gray-600" />
                        )}
                        <span className="text-xs font-medium capitalize">
                          {entry.role === 'user' ? 'You' : 'AI Interviewer'}
                        </span>
                      </div>
                      <p className="text-sm">{entry.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current question display */}
              {interviewData.interviewQuestions[currentQuestionIndex] && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">Current Question:</h4>
                  <p className="text-blue-700">
                    {interviewData.interviewQuestions[currentQuestionIndex].question}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden audio element for playing AI responses */}
      <audio ref={audioRef} />
    </div>
  );
};

export default SimplifiedInterview;
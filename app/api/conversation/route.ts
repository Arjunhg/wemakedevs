import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userTranscript, currentQuestion, interviewQuestions, conversationHistory = [] } = await request.json();

    if (!userTranscript) {
      return NextResponse.json({ error: 'User transcript is required' }, { status: 400 });
    }

    // Add user response to conversation history
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: userTranscript, timestamp: new Date().toISOString() }
    ];

    // Determine AI response based on context
    let aiResponse = '';
    let nextQuestionIndex = -1;

    if (conversationHistory.length === 0) {
      // First response - greet and ask first question
      aiResponse = `Hello! Welcome to your interview. I'm excited to learn more about you. Let's start with our first question: ${currentQuestion}`;
    } else {
      // Analyze the user's response and provide feedback or move to next question
      const isAnswerComplete = userTranscript.length > 50; // Simple heuristic
      
      if (isAnswerComplete) {
        // Provide brief acknowledgment and move to next question
        const acknowledgments = [
          "Thank you for that detailed response.",
          "That's a great perspective.",
          "I appreciate your insights.",
          "That's very interesting.",
          "Thank you for sharing that experience."
        ];
        
        const randomAck = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
        
        // Find current question index and get next
        const currentIndex = interviewQuestions.findIndex((q: any) => q.question === currentQuestion);
        if (currentIndex !== -1 && currentIndex < interviewQuestions.length - 1) {
          nextQuestionIndex = currentIndex + 1;
          const nextQuestion = interviewQuestions[nextQuestionIndex];
          aiResponse = `${randomAck} Now, let's move on to our next question: ${nextQuestion.question}`;
        } else {
          // Interview is complete
          aiResponse = `${randomAck} That concludes our interview. Thank you for your time and thoughtful responses. We'll be in touch soon with next steps.`;
        }
      } else {
        // Ask for more details
        aiResponse = "Could you please elaborate on that a bit more? I'd love to hear more details about your experience.";
      }
    }

    // Add AI response to history
    const finalHistory = [
      ...updatedHistory,
      { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
    ];

    return NextResponse.json({
      aiResponse,
      conversationHistory: finalHistory,
      nextQuestionIndex,
      isComplete: nextQuestionIndex === -1 && conversationHistory.length > 0
    });

  } catch (error: any) {
    console.error('Conversation API error:', error);
    return NextResponse.json(
      { error: 'Failed to process conversation', details: error.message },
      { status: 500 }
    );
  }
}
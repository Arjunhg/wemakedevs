export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface InterviewQuestion {
  question: string;
  answer: string;
}

export interface ConversationState {
  currentQuestionIndex: number;
  conversationHistory: ConversationEntry[];
  isComplete: boolean;
  isWaitingForResponse: boolean;
}

export class AIConversationService {
  private state: ConversationState = {
    currentQuestionIndex: 0,
    conversationHistory: [],
    isComplete: false,
    isWaitingForResponse: false
  };

  private interviewQuestions: InterviewQuestion[] = [];

  constructor(interviewQuestions: InterviewQuestion[]) {
    this.interviewQuestions = interviewQuestions;
  }

  getInitialGreeting(): string {
    if (this.interviewQuestions.length === 0) {
      return "Hello! Welcome to your interview. Unfortunately, I don't have any questions prepared. Please contact support.";
    }

    const greeting = `Hello! Welcome to your technical interview with HireWise. I'm your AI interviewer, and I'm excited to learn more about you today. 

I'll be conducting a structured interview with ${this.interviewQuestions.length} questions to better understand your background and expertise. We'll have a natural conversation, so feel free to elaborate on your answers and ask for clarification if needed.

Let's start with our first question: ${this.interviewQuestions[0].question}`;

    this.addToHistory('assistant', greeting);
    this.state.isWaitingForResponse = true;
    
    return greeting;
  }

  async processUserResponse(userText: string): Promise<string> {
    if (!this.state.isWaitingForResponse) {
      return "I'm sorry, I wasn't expecting a response right now. Please wait for my next question.";
    }

    // Add user response to history
    this.addToHistory('user', userText);
    this.state.isWaitingForResponse = false;

    // Generate AI response based on current context
    const aiResponse = await this.generateAIResponse(userText);
    this.addToHistory('assistant', aiResponse);

    return aiResponse;
  }

  private async generateAIResponse(userText: string): Promise<string> {
    const currentQuestion = this.interviewQuestions[this.state.currentQuestionIndex];
    const isLastQuestion = this.state.currentQuestionIndex >= this.interviewQuestions.length - 1;

    // Analyze response quality (simple heuristic)
    const isDetailedResponse = userText.length > 100;
    const hasSpecificExamples = /example|experience|project|worked|built|developed|implemented/i.test(userText);
    
    // Generate acknowledgment
    const acknowledgments = [
      "Thank you for that detailed response.",
      "That's really insightful.",
      "I appreciate you sharing that experience.",
      "That's a great perspective.",
      "Thank you for elaborating on that.",
      "That's very helpful to understand.",
      "Excellent, that gives me good insight."
    ];

    const encouragements = [
      "That shows strong problem-solving skills.",
      "Great example of practical experience.",
      "That demonstrates good technical thinking.",
      "I can see you have solid experience in this area.",
      "That's exactly the kind of experience we value.",
      "Your approach sounds very methodical.",
      "That shows excellent attention to detail."
    ];

    let response = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
    
    // Add encouragement for detailed responses
    if (isDetailedResponse || hasSpecificExamples) {
      response += ` ${encouragements[Math.floor(Math.random() * encouragements.length)]}`;
    }

    // Move to next question or conclude
    if (isLastQuestion) {
      this.state.isComplete = true;
      response += `

That concludes our interview questions. You've provided excellent insights throughout our conversation, and I've gained a good understanding of your background and capabilities.

Do you have any questions about the role, our team, or HireWise before we wrap up? If not, thank you so much for your time today. Our team will review your responses and be in touch about next steps soon.`;
    } else {
      // Move to next question
      this.state.currentQuestionIndex++;
      const nextQuestion = this.interviewQuestions[this.state.currentQuestionIndex];
      
      const transitions = [
        "Now let's move on to our next question:",
        "Great! Let me ask you about something else:",
        "Perfect. Here's my next question:",
        "Thank you. Now I'd like to ask:",
        "Excellent. Let's explore another area:",
        "Great response. Moving on:"
      ];

      const transition = transitions[Math.floor(Math.random() * transitions.length)];
      response += `

${transition} ${nextQuestion.question}`;
      
      this.state.isWaitingForResponse = true;
    }

    return response;
  }

  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.state.conversationHistory.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });
  }

  getCurrentQuestion(): InterviewQuestion | null {
    if (this.state.currentQuestionIndex < this.interviewQuestions.length) {
      return this.interviewQuestions[this.state.currentQuestionIndex];
    }
    return null;
  }

  getState(): ConversationState {
    return { ...this.state };
  }

  getConversationHistory(): ConversationEntry[] {
    return [...this.state.conversationHistory];
  }

  isInterviewComplete(): boolean {
    return this.state.isComplete;
  }

  getProgress(): { current: number; total: number; percentage: number } {
    const current = Math.min(this.state.currentQuestionIndex + 1, this.interviewQuestions.length);
    const total = this.interviewQuestions.length;
    const percentage = Math.round((current / total) * 100);
    
    return { current, total, percentage };
  }

  reset(): void {
    this.state = {
      currentQuestionIndex: 0,
      conversationHistory: [],
      isComplete: false,
      isWaitingForResponse: false
    };
  }
}
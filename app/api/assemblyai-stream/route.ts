import { NextRequest, NextResponse } from 'next/server';
import { AssemblyAI } from 'assemblyai';

export async function POST(request: NextRequest) {
  console.log('🔥 AssemblyAI route called - Route is working!');
  
  try {
    
    const { action } = await request.json();
    console.log('Action:', action);

    if (action === 'start') {
      console.log('🚀 Starting AssemblyAI v3 streaming session...');
      
      // For v3 Universal Streaming API, we don't need to generate a token
      // The WebSocket connection uses the API key directly in the Authorization header
      console.log('✅ AssemblyAI v3 streaming ready');
      
      return NextResponse.json({
        apiKey: process.env.ASSEMBLYAI_API_KEY!,
        endpoint: 'wss://streaming.assemblyai.com/v3/ws'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ AssemblyAI stream error:', error);
    return NextResponse.json(
      { error: 'Failed to create AssemblyAI session', details: error.message },
      { status: 500 }
    );
  }
}

// Add a simple GET method to test if the route is accessible
export async function GET() {
  console.log('🔥 AssemblyAI route GET called - Route is accessible!');
  return NextResponse.json({ message: 'AssemblyAI route is working' });
}
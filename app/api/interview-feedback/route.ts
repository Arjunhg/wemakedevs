import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest){
    try {
        const { messages } = await request.json();

        // Convert messages array to JSON string to match what n8n expects
        const result = await axios.post(process.env.N8N_FEEDBACK_URL || '', {
            message: messages  // Note: "message" not "messages", and stringified
        })

        
        // Return the complete feedback object
        const feedback = result.data?.message?.content;

        return NextResponse.json(feedback);
    } catch (error) {
        console.error("Error in feedback API:", error);
        return NextResponse.json({ error: "Failed to generate feedback" }, { status: 500 });
    }
}
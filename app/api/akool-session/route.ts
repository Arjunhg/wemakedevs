import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { avatar_id, voice_id } = await request.json();

        console.log("Creating Akool session with:", { avatar_id, voice_id });
        console.log("Using token:", process.env.AKOOL_API_TOKEN ? "Present" : "Missing");

        const result = await axios.post('https://openapi.akool.com/api/open/v4/liveAvatar/session/create', 
            {
                avatar_id: avatar_id,
                // knowledge_id: kb_id,
                voice_id: voice_id
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.AKOOL_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        console.log("Akool API response:", result.data);

        return NextResponse.json(result.data);
    } catch (error: any) {
        console.error("Akool session creation failed:", {
            message: error?.message,
            status: error?.response?.status,
            data: error?.response?.data,
            headers: error?.response?.headers
        });

        return NextResponse.json(
            { 
                error: 'Failed to create Akool session',
                details: error?.response?.data || error?.message,
                status: error?.response?.status 
            },
            { status: error?.response?.status || 500 }
        );
    }
}
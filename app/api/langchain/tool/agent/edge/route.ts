import { NextRequest, NextResponse } from "next/server";
import { AgentApi, RequestBody, ResponseBody } from "../agentapi";
import { auth } from "@/app/api/auth";
import { EdgeTool } from "../../../../langchain-tools/edge_tools";
import { OpenAI } from "langchain/llms/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

async function handle(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }
  try {
    const authResult = auth(req);
    if (authResult.error) {
      return NextResponse.json(authResult, {
        status: 401,
      });
    }

    const encoder = new TextEncoder();
    const transformStream = new TransformStream();
    const writer = transformStream.writable.getWriter();
    const agentApi = new AgentApi(encoder, transformStream, writer);

    const reqBody: RequestBody = await req.json();
    const authToken = req.headers.get("Authorization") ?? "";
    const token = authToken.trim().replaceAll("Bearer ", "").trim();

    const apiKey = await agentApi.getOpenAIApiKey(token);
    const baseUrl = await agentApi.getOpenAIBaseUrl(reqBody.baseUrl);

    const model = new OpenAI(
      {
        temperature: 0,
        modelName: reqBody.model,
        openAIApiKey: apiKey,
      },
      { basePath: baseUrl },
    );
    // console.log("model = ", model);
    const embeddings = new OpenAIEmbeddings(
      {
        openAIApiKey: apiKey,
      },
      { basePath: baseUrl },
    );
    // console.log("embeddings = ", embeddings);
    var dalleCallback = async (data: string) => {
      var response = new ResponseBody();
      response.message = data;
      await writer.ready;
      await writer.write(
        encoder.encode(`data: ${JSON.stringify(response)}\n\n`),
      );
    };
    // console.log("dalleCallback = ", dalleCallback);
    var edgeTool = new EdgeTool(
      apiKey,
      baseUrl,
      model,
      embeddings,
      dalleCallback,
    );
    var edgeTools = await edgeTool.getCustomTools();
    var tools = [...edgeTools];
    // var resp = await agentApi.getApiHandler(req, reqBody, tools);
    // return resp;
    
    //Modified code below
    try {
    const resp = await agentApi.getApiHandler(req, reqBody, tools);
  
    // Extract the JSON response from the response stream
    const reader = resp.readable.getReader();
    const chunks = [];
    let chunk;
    while ((chunk = await reader.read())) {
      chunks.push(chunk.value);
    }
    const jsonResponse = JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks)));

    // Handle the response based on its type
    if (jsonResponse.isSuccess) {
      // Success response
      return NextResponse.json(jsonResponse, {
        status: 200,
      });
    } else if (jsonResponse.error) {
      // Error response
      return NextResponse.json(jsonResponse, {
        status: 500,
      });
    } else {
      // Unexpected response
      return NextResponse.json({
        error: "Unexpected response received from agentApi.getApiHandler",
      }, {
        status: 500,
      });
    }
  } catch (e) {
    // Handle any errors
    return NextResponse.json({
      error: (e as any).message,
    }, {
      status: 500,
    });
  }
    //=======================================
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as any).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";

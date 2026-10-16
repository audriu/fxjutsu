import { NextResponse } from "next/server";
import { getJob } from "@/lib/comfy";
import { finished } from "@/lib/guard";


export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await getJob(id);
    if (!["queued", "running", "pending", "in_progress"].includes(job.status)) finished(id);
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check job." }, { status: 502 });
  }
}

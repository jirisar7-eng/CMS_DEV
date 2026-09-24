import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublicProjectContext } from "@/lib/domain/navigation/public-context";
import { SeoService } from "@/lib/domain/seo/service";

export async function GET(req: Request) {
  try {
    const projectId = await resolvePublicProjectContext(req);
    if (!projectId) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (process.env.FORCE_NOINDEX === "true") {
      return new NextResponse("User-agent: *\nDisallow: /", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const settings = await prisma.projectSeoSettings.findUnique({
      where: { projectId },
      select: { robotsTxt: true },
    });

    const robotsContent = SeoService.resolveRobotsText(settings?.robotsTxt);

    return new NextResponse(robotsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }
}

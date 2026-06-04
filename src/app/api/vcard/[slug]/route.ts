import { NextResponse } from "next/server";
import { getMember } from "@/lib/team";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const member = getMember(slug);

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [first, ...rest] = member.name.split(" ");
  const last = rest.join(" ");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${member.name}`,
    `N:${last};${first};;;`,
    "ORG:Travel Light",
    `TITLE:${member.role}`,
    member.phone ? `TEL;TYPE=CELL,VOICE:${member.phone}` : null,
    `EMAIL;TYPE=INTERNET,WORK:${member.email}`,
    "URL:https://travellight.com",
    member.city ? `ADR;TYPE=WORK:;;;${member.city};;;` : null,
    member.bio ? `NOTE:${member.bio}` : null,
    "END:VCARD",
  ].filter(Boolean);

  const vcf = lines.join("\r\n") + "\r\n";

  return new NextResponse(vcf, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${member.slug}-travellight.vcf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}

"use client";

import { useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Mail, Globe, Download, Share2, Plane } from "lucide-react";
import { getMember, type TeamMember } from "@/lib/team";

export default function DigitalCardPage() {
  const params = useParams<{ slug: string }>();
  const [copied, setCopied] = useState(false);
  const member: TeamMember | null = params?.slug
    ? getMember(params.slug)
    : null;

  if (member === null) {
    notFound();
  }

  const phoneHref = member.phone ? `tel:${member.phone.replace(/[^0-9+]/g, "")}` : undefined;
  const mailHref = `mailto:${member.email}`;
  const vcardHref = `/api/vcard/${member.slug}`;

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${member!.name} — Travel Light`,
          text: `${member!.name} · ${member!.role} · Travel Light`,
          url,
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // no-op
    }
  }

  return (
    <div className="min-h-screen bg-[#081546] text-white flex flex-col">
      {/* Plane motif background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Plane
          className="absolute -top-10 -right-20 w-[28rem] h-[28rem] text-[#ff6868]/[0.07] -rotate-12"
          strokeWidth={1}
        />
        <Plane
          className="absolute bottom-20 -left-16 w-64 h-64 text-[#ff6868]/[0.05] rotate-180"
          strokeWidth={1}
        />
      </div>

      {/* Card container */}
      <div className="relative flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {/* Header: brand mark + slogan */}
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#ff6868]">
                <Plane className="w-3.5 h-3.5 text-white -rotate-45" strokeWidth={2.5} />
              </span>
              <span className="text-base font-bold tracking-tight">Travel Light</span>
            </Link>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
              No. 1
            </span>
          </div>

          {/* Name block */}
          <div className="space-y-1 mb-2">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {member.name}
            </h1>
            <p className="text-[#ff7a85] text-sm font-semibold uppercase tracking-[0.15em]">
              {member.role}
            </p>
          </div>

          {member.bio && (
            <p className="text-white/65 text-sm leading-relaxed mb-7">{member.bio}</p>
          )}

          {/* Contact rows */}
          <div className="space-y-2 mb-7">
            {member.phone && phoneHref && (
              <a
                href={phoneHref}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.13] transition-colors border border-white/[0.08]"
              >
                <Phone className="w-4 h-4 text-[#ff7a85]" />
                <span className="text-sm font-medium">{member.phone}</span>
              </a>
            )}
            <a
              href={mailHref}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.13] transition-colors border border-white/[0.08]"
            >
              <Mail className="w-4 h-4 text-[#ff7a85]" />
              <span className="text-sm font-medium break-all">{member.email}</span>
            </a>
            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.13] transition-colors border border-white/[0.08]"
            >
              <Globe className="w-4 h-4 text-[#ff7a85]" />
              <span className="text-sm font-medium">travellight.com</span>
            </Link>
          </div>

          {/* Primary actions */}
          <div className="grid grid-cols-2 gap-2 mb-7">
            <a
              href={vcardHref}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#ff6868] hover:bg-[#f45f6a] active:bg-[#e95360] transition-colors text-sm font-semibold"
            >
              <Download className="w-4 h-4" />
              Save contact
            </a>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-colors text-sm font-semibold"
            >
              <Share2 className="w-4 h-4" />
              {copied ? "Copied" : "Share"}
            </button>
          </div>

          {/* Slogan footer */}
          <div className="pt-6 border-t border-white/10 text-center">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
              Travel light, arrive smart
            </p>
            <p className="mt-1.5 text-[10px] text-white/30">
              We move your bags. You move freely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

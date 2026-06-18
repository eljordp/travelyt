"use client";

import {
  BriefcaseBusiness,
  ClipboardCheck,
  LifeBuoy,
} from "lucide-react";
import AppChrome, { type AppChromeNavItem } from "@/components/AppChrome";

const driverNavItems: AppChromeNavItem[] = [
  { href: "/driver", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/driver/apply", label: "Apply", icon: ClipboardCheck },
  { href: "/support", label: "Help", icon: LifeBuoy },
];

export default function DriverChrome({
  children,
  title = "Driver",
  action,
  contentWidthClassName = "max-w-3xl",
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
  contentWidthClassName?: string;
}) {
  return (
    <AppChrome
      title={title}
      action={action}
      contentWidthClassName={contentWidthClassName}
      homeHref="/driver"
      navItems={driverNavItems}
      showAccountAction={false}
    >
      {children}
    </AppChrome>
  );
}

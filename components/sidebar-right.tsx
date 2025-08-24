import * as React from "react"
import { Plus, TrendingUp, BarChart3, Activity } from "lucide-react"

import { Calendars } from "@/components/calendars"
import { DatePicker } from "@/components/date-picker"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import { ChartBarHorizontal } from "./chart-bar-horizontal"
import { ChartAreaStacked } from "./chart-area-stacked"
import { ChartPieDonutText } from "./chart-pie-donut-text"

// This is sample data.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  calendars: [
    {
      name: "My Calendars",
      items: ["Personal", "Work", "Family"],
    },
    {
      name: "Favorites",
      items: ["Holidays", "Birthdays"],
    },
    {
      name: "Other",
      items: ["Travel", "Reminders", "Deadlines"],
    },
  ],
}

export function SidebarRight({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh border-l lg:flex"
      style={{ "--sidebar-width": "20rem" } as React.CSSProperties}
      {...props}
    >
      <SidebarHeader className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">KPIs</h2>
      </SidebarHeader>
      <SidebarContent className="gap-2 py-2">
        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-2 mb-2">
            <TrendingUp className="h-4 w-4" />
            <span>Visitor Distribution</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ChartPieDonutText />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-2 mb-2">
            <BarChart3 className="h-4 w-4" />
            <span>Monthly Performance</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ChartBarHorizontal />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-2 mb-2">
            <Activity className="h-4 w-4" />
            <span>Trend Analysis</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ChartAreaStacked />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {/* <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Plus />
              <span>New Calendar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter> */}
    </Sidebar>
  )
}

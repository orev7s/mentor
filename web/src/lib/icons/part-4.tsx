import { createIcon, type Icon } from "./core"

export const ScrollTextIcon: Icon = createIcon("scroll-text", [
  [
    "path",
    {
      d: "M5.5 7a2 2 0 1 1 2-2v13.5A2.5 2.5 0 0 0 10 21h7a2.5 2.5 0 0 0 2.5-2.5v-13A2.5 2.5 0 0 0 17 3H5.5",
    },
  ],
  ["path", { d: "M11 8.5h5" }],
  ["path", { d: "M11 12.5h5" }],
  ["path", { d: "M11 16.5h3" }],
])

export const SearchIcon: Icon = createIcon("search", [
  ["path", { d: "M4 10.75a6.75 6.75 0 1 0 13.5 0 6.75 6.75 0 1 0-13.5 0" }],
  ["path", { d: "m15.75 15.75 4.5 4.5" }],
])

export const SearchXIcon: Icon = createIcon("search-x", [
  ["path", { d: "M4 10.75a6.75 6.75 0 1 0 13.5 0 6.75 6.75 0 1 0-13.5 0" }],
  ["path", { d: "m15.75 15.75 4.5 4.5" }],
  ["path", { d: "m8.25 8.25 5 5" }],
  ["path", { d: "m13.25 8.25-5 5" }],
])

export const SendIcon: Icon = createIcon("send", [
  [
    "path",
    {
      d: "m19.9 5.69-3.91 11.26a1.5 1.5 0 0 1-2.79.12l-1.72-3.8a1.5 1.5 0 0 0-.75-.75l-3.8-1.72a1.5 1.5 0 0 1 .12-2.79L18.31 4.1a1.25 1.25 0 0 1 1.59 1.59",
    },
  ],
  ["path", { d: "m11.25 12.75 5-5" }],
])
export const ServerIcon: Icon = createIcon("server", [
  [
    "path",
    {
      d: "M5.5 3h13A2.5 2.5 0 0 1 21 5.5V8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 8V5.5A2.5 2.5 0 0 1 5.5 3",
    },
  ],
  [
    "path",
    {
      d: "M5.5 13.5h13A2.5 2.5 0 0 1 21 16v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V16a2.5 2.5 0 0 1 2.5-2.5",
    },
  ],
  ["path", { d: "M7 6.75h.01" }],
  ["path", { d: "M7 17.25h.01" }],
])

export const SettingsIcon: Icon = createIcon("settings", [
  [
    "path",
    {
      d: "m9.17 5.26.2-.98a1.5 1.5 0 0 1 1.47-1.21h2.32a1.5 1.5 0 0 1 1.47 1.21l.2.98a1.5 1.5 0 0 0 .72 1.01l-.37-.21a1.5 1.5 0 0 0 1.24.12l.95-.32a1.5 1.5 0 0 1 1.79.67l1.16 2.01a1.5 1.5 0 0 1-.31 1.88l-.76.66a1.5 1.5 0 0 0-.52 1.13v-.42a1.5 1.5 0 0 0 .52 1.13l.76.66a1.5 1.5 0 0 1 .31 1.88l-1.16 2.01a1.5 1.5 0 0 1-1.79.67l-.95-.32a1.5 1.5 0 0 0-1.24.12l.37-.21a1.5 1.5 0 0 0-.72 1.01l-.2.98a1.5 1.5 0 0 1-1.47 1.21h-2.32a1.5 1.5 0 0 1-1.47-1.21l-.2-.98a1.5 1.5 0 0 0-.72-1.01l.37.21a1.5 1.5 0 0 0-1.24-.12l-.95.32a1.5 1.5 0 0 1-1.79-.67l-1.16-2.01a1.5 1.5 0 0 1 .31-1.88l.76-.66a1.5 1.5 0 0 0 .52-1.13v.42a1.5 1.5 0 0 0-.52-1.13l-.76-.66a1.5 1.5 0 0 1-.31-1.88l1.16-2.01a1.5 1.5 0 0 1 1.79-.67l.95.32a1.5 1.5 0 0 0 1.24-.12l-.37.21a1.5 1.5 0 0 0 .72-1.01",
    },
  ],
  ["path", { d: "M9.25 12a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 1 0-5.5 0" }],
])

export const Settings2Icon: Icon = createIcon("settings-2", [
  ["path", { d: "M5.75 7a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 1 0-5.5 0" }],
  ["path", { d: "M14.25 7H21" }],
  ["path", { d: "M12.75 17a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 1 0-5.5 0" }],
  ["path", { d: "M3 17h6.75" }],
])

export const ShapesIcon: Icon = createIcon("shapes", [
  [
    "path",
    {
      d: "m13.07 4.29 2.29 3.82A1.25 1.25 0 0 1 14.29 10H9.71a1.25 1.25 0 0 1-1.07-1.89l2.29-3.82a1.25 1.25 0 0 1 2.14 0",
    },
  ],
  ["path", { d: "M5 13.5h3.5a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 2-2" }],
  ["path", { d: "M13.5 17.25a3.75 3.75 0 1 0 7.5 0 3.75 3.75 0 1 0-7.5 0" }],
])

export const ShareIcon: Icon = createIcon("share", [
  ["path", { d: "M4.5 11v6.75a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V11" }],
  ["path", { d: "m16 7.25-2.59-2.59a2 2 0 0 0-2.82 0L8 7.25" }],
  ["path", { d: "M12 15.25v-7.5" }],
])

export const Share2Icon: Icon = createIcon("share-2", [
  ["path", { d: "M15.25 5.25a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 1 0-5.5 0" }],
  ["path", { d: "M3.25 12a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 1 0-5.5 0" }],
  ["path", { d: "M15.25 18.75a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 1 0-5.5 0" }],
  ["path", { d: "m8.4 10.65 7.2-4.05" }],
  ["path", { d: "m8.4 13.35 7.2 4.05" }],
])

export const ShieldIcon: Icon = createIcon("shield", [
  [
    "path",
    {
      d: "m13.63 3.31 5.02 1.73A2 2 0 0 1 20 6.93v5.32C20 17 16.5 20 12 21.5 7.5 20 4 17 4 12.25V6.93a2 2 0 0 1 1.35-1.89l5.02-1.73a5 5 0 0 1 3.26 0",
    },
  ],
])

export const ShieldAlertIcon: Icon = createIcon("shield-alert", [
  [
    "path",
    {
      d: "m13.63 3.31 5.02 1.73A2 2 0 0 1 20 6.93v5.32C20 17 16.5 20 12 21.5 7.5 20 4 17 4 12.25V6.93a2 2 0 0 1 1.35-1.89l5.02-1.73a5 5 0 0 1 3.26 0",
    },
  ],
  ["path", { d: "M12 7.75v4.75" }],
  ["path", { d: "M12 16h.01" }],
])

export const ShieldCheckIcon: Icon = createIcon("shield-check", [
  [
    "path",
    {
      d: "m13.63 3.31 5.02 1.73A2 2 0 0 1 20 6.93v5.32C20 17 16.5 20 12 21.5 7.5 20 4 17 4 12.25V6.93a2 2 0 0 1 1.35-1.89l5.02-1.73a5 5 0 0 1 3.26 0",
    },
  ],
  ["path", { d: "m8.5 12 1.26 1.26a1.75 1.75 0 0 0 2.48 0l3.51-3.51" }],
])

export const ShieldXIcon: Icon = createIcon("shield-x", [
  [
    "path",
    {
      d: "m13.63 3.31 5.02 1.73A2 2 0 0 1 20 6.93v5.32C20 17 16.5 20 12 21.5 7.5 20 4 17 4 12.25V6.93a2 2 0 0 1 1.35-1.89l5.02-1.73a5 5 0 0 1 3.26 0",
    },
  ],
  ["path", { d: "m9.25 9.25 5.5 5.5" }],
  ["path", { d: "m14.75 9.25-5.5 5.5" }],
])

export const ShoppingBagIcon: Icon = createIcon("shopping-bag", [
  [
    "path",
    {
      d: "M7.04 7.5h9.92a2 2 0 0 1 1.99 1.78l.99 8.94A2.5 2.5 0 0 1 17.46 21H6.54a2.5 2.5 0 0 1-2.48-2.78l.99-8.94A2 2 0 0 1 7.04 7.5",
    },
  ],
  ["path", { d: "M15.5 10.5a3.5 3.5 0 0 1-7 0" }],
])

export const ShoppingCartIcon: Icon = createIcon("shopping-cart", [
  ["path", { d: "M2.5 3.5h.98a1.25 1.25 0 0 1 1.22 1l2.06 10.29A1.5 1.5 0 0 0 8.23 16H18.5" }],
  ["path", { d: "M5.25 6.5h13.93a1.25 1.25 0 0 1 1.22 1.53l-.93 4a1.25 1.25 0 0 1-1.21.97H6.5" }],
  ["path", { d: "M7 20a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0" }],
  ["path", { d: "M16 20a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0" }],
])

export const ShuffleIcon: Icon = createIcon("shuffle", [
  ["path", { d: "M2.75 18h1.96a3 3 0 0 0 2.64-1.57l4.8-8.86A3 3 0 0 1 14.79 6h2.46" }],
  ["path", { d: "M2.75 6h1.96a3 3 0 0 1 2.64 1.57l.69 1.28" }],
  ["path", { d: "m11.46 15.15.69 1.28A3 3 0 0 0 14.79 18h2.46" }],
  ["path", { d: "m18 2.5 2.26 2.26a1.75 1.75 0 0 1 0 2.48L18 9.5" }],
  ["path", { d: "m18 14.5 2.26 2.26a1.75 1.75 0 0 1 0 2.48L18 21.5" }],
])

export const SkipBackIcon: Icon = createIcon("skip-back", [
  [
    "path",
    {
      d: "m16.43 6.68-5.41 3.42a2.25 2.25 0 0 0 0 3.8l5.41 3.42a2 2 0 0 0 3.07-1.7V8.38a2 2 0 0 0-3.07-1.7",
    },
  ],
  ["path", { d: "M4.5 5v14" }],
])

export const SkipForwardIcon: Icon = createIcon("skip-forward", [
  [
    "path",
    {
      d: "m7.57 6.68 5.41 3.42a2.25 2.25 0 0 1 0 3.8l-5.41 3.42a2 2 0 0 1-3.07-1.7V8.38a2 2 0 0 1 3.07-1.7",
    },
  ],
  ["path", { d: "M19.5 5v14" }],
])

export const SlashCommandIcon: Icon = createIcon("slash-command", [
  ["path", { d: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3" }],
  ["path", { d: "m14 8-4 8" }],
])

export const SlidersHorizontalIcon: Icon = createIcon("sliders-horizontal", [
  ["path", { d: "M6.75 5.5a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 1 0-4.5 0" }],
  ["path", { d: "M3 5.5h.75" }],
  ["path", { d: "M14.25 5.5H21" }],
  ["path", { d: "M13.25 12a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 1 0-4.5 0" }],
  ["path", { d: "M3 12h7.25" }],
  ["path", { d: "M20.75 12H21" }],
  ["path", { d: "M5.25 18.5a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 1 0-4.5 0" }],
  ["path", { d: "M12.75 18.5H21" }],
])

export const SmartphoneIcon: Icon = createIcon("smartphone", [
  ["path", { d: "M9 2.5h6a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-13a3 3 0 0 1 3-3" }],
  ["path", { d: "M12 17.75h.01" }],
])

export const SmileIcon: Icon = createIcon("smile", [
  ["path", { d: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0" }],
  ["path", { d: "M9 9.5h.01" }],
  ["path", { d: "M15 9.5h.01" }],
  ["path", { d: "M15.9 14a4.5 4.5 0 0 1-7.8 0" }],
])

export const SnowflakeIcon: Icon = createIcon("snowflake", [
  ["path", { d: "M12 2.5v19" }],
  ["path", { d: "m3.77 7.25 16.46 9.5" }],
  ["path", { d: "m3.77 16.75 16.46-9.5" }],
  ["path", { d: "m9.3 3.68 2.21 1.9a.75.75 0 0 0 .98 0l2.21-1.9" }],
  ["path", { d: "m17.85 5.5-.53 2.87a.75.75 0 0 0 .48.84l2.76.97" }],
  ["path", { d: "m20.56 13.82-2.76.97a.75.75 0 0 0-.48.84l.53 2.87" }],
  ["path", { d: "m14.7 20.32-2.21-1.9a.75.75 0 0 0-.98 0l-2.21 1.9" }],
  ["path", { d: "m6.15 18.5.53-2.87a.75.75 0 0 0-.48-.84l-2.76-.97" }],
  ["path", { d: "m3.44 10.18 2.76-.97a.75.75 0 0 0 .48-.84L6.15 5.5" }],
])

export const SquareIcon: Icon = createIcon("square", [
  ["path", { d: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3" }],
])

export const SquareDashedIcon: Icon = createIcon("square-dashed", [
  ["path", { d: "M3 7V6a3 3 0 0 1 3-3h1" }],
  ["path", { d: "M17 3h1a3 3 0 0 1 3 3v1" }],
  ["path", { d: "M21 17v1a3 3 0 0 1-3 3h-1" }],
  ["path", { d: "M7 21H6a3 3 0 0 1-3-3v-1" }],
  ["path", { d: "M10.5 3h3" }],
  ["path", { d: "M21 10.5v3" }],
  ["path", { d: "M13.5 21h-3" }],
  ["path", { d: "M3 13.5v-3" }],
])

export const SquarePenIcon: Icon = createIcon("square-pen", [
  ["path", { d: "M11.5 3.5h-5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-5" }],
  ["path", { d: "M18.2 3.8a1.9 1.9 0 0 1 2.7 2.7L13.4 14 10 15l1-3.4Z" }],
])

export const SquareTerminalIcon: Icon = createIcon("square-terminal", [
  ["path", { d: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3" }],
  ["path", { d: "m7.5 8.75 1.87 1.87a1.25 1.25 0 0 1 0 1.76L7.5 14.25" }],
  ["path", { d: "M12.5 15.25h4" }],
])

export const StarIcon: Icon = createIcon("star", [
  [
    "path",
    {
      d: "m13.39 6.07.96 2.39a1 1 0 0 0 .86.62l2.57.18a1.5 1.5 0 0 1 .86 2.64l-1.97 1.66a1 1 0 0 0-.33 1.01l.63 2.5a1.5 1.5 0 0 1-2.26 1.63l-2.18-1.37a1 1 0 0 0-1.06 0L9.29 18.7a1.5 1.5 0 0 1-2.26-1.63l.63-2.5a1 1 0 0 0-.33-1.01L5.36 11.9a1.5 1.5 0 0 1 .86-2.64l2.57-.18a1 1 0 0 0 .86-.62l.96-2.39a1.5 1.5 0 0 1 2.78 0",
    },
  ],
])

export const StoreIcon: Icon = createIcon("store", [
  [
    "path",
    {
      d: "M6.39 3h11.22a1.5 1.5 0 0 1 1.32.78L21.25 8a2.31 2.31 0 0 1-4.62 0h-.01A2.31 2.31 0 0 1 12 8a2.31 2.31 0 0 1-4.62 0h-.01a2.31 2.31 0 0 1-4.62 0l2.32-4.22A1.5 1.5 0 0 1 6.39 3",
    },
  ],
  ["path", { d: "M4.5 13.25V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5.75" }],
  ["path", { d: "M9.5 21v-3a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v3" }],
])

export const SubagentIcon: Icon = createIcon("subagent", [
  ["path", { d: "M5 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" }],
  ["path", { d: "M6.5 11.5v4.25a2.5 2.5 0 0 0 2.5 2.5h3.75" }],
  ["path", { d: "M6.5 12h6.25" }],
  [
    "path",
    {
      d: "M15.75 9.75h2A1.25 1.25 0 0 1 19 11v2a1.25 1.25 0 0 1-1.25 1.25h-2A1.25 1.25 0 0 1 14.5 13v-2a1.25 1.25 0 0 1 1.25-1.25",
    },
  ],
  [
    "path",
    {
      d: "M15.75 16h2A1.25 1.25 0 0 1 19 17.25v2a1.25 1.25 0 0 1-1.25 1.25h-2a1.25 1.25 0 0 1-1.25-1.25v-2A1.25 1.25 0 0 1 15.75 16",
    },
  ],
])

export const SunIcon: Icon = createIcon("sun", [
  ["path", { d: "M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0" }],
  ["path", { d: "M19 12h2.25" }],
  ["path", { d: "m16.95 16.95 1.59 1.59" }],
  ["path", { d: "M12 19v2.25" }],
  ["path", { d: "m7.05 16.95-1.59 1.59" }],
  ["path", { d: "M5 12H2.75" }],
  ["path", { d: "M7.05 7.05 5.46 5.46" }],
  ["path", { d: "M12 5V2.75" }],
  ["path", { d: "m16.95 7.05 1.59-1.59" }],
])

export const SunriseIcon: Icon = createIcon("sunrise", [
  ["path", { d: "M7.5 18a4.5 4.5 0 0 1 9 0" }],
  ["path", { d: "M5.25 18H3" }],
  ["path", { d: "m7.23 13.23-1.59-1.59" }],
  ["path", { d: "m16.77 13.23 1.59-1.59" }],
  ["path", { d: "M18.75 18H21" }],
  ["path", { d: "M2.5 21.25h19" }],
  ["path", { d: "m9 6 1.94-1.94a1.5 1.5 0 0 1 2.12 0L15 6" }],
  ["path", { d: "M12 7.25v2.5" }],
])

export const TableIcon: Icon = createIcon("table", [
  ["path", { d: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3" }],
  ["path", { d: "M6.25 9h11.5" }],
  ["path", { d: "M6.25 15H9" }],
  ["path", { d: "M15 15h2.75" }],
  ["path", { d: "M12 12v5.75" }],
])

export const TabletIcon: Icon = createIcon("tablet", [
  ["path", { d: "M7 2.5h10a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-13a3 3 0 0 1 3-3" }],
  ["path", { d: "M12 17.75h.01" }],
])

export const TagIcon: Icon = createIcon("tag", [
  [
    "path",
    {
      d: "M5.5 3h5.17a2 2 0 0 1 1.42.59l7.25 7.25a2 2 0 0 1 0 2.82l-5.68 5.68a2 2 0 0 1-2.82 0l-7.25-7.25A2 2 0 0 1 3 10.67V5.5A2.5 2.5 0 0 1 5.5 3",
    },
  ],
  ["path", { d: "M7 7.75a.75.75 0 1 0 1.5 0 .75.75 0 1 0-1.5 0" }],
])

export const TerminalIcon: Icon = createIcon("terminal", [
  ["path", { d: "m4.5 6 4.09 4.09a2 2 0 0 1 0 2.82L4.5 17" }],
  ["path", { d: "M12.5 18h7" }],
])

export const TestTubeIcon: Icon = createIcon("test-tube", [
  ["path", { d: "M9.5 3v15.75a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5V3" }],
  ["path", { d: "M7.5 3h9" }],
  ["path", { d: "M9.5 14h5" }],
])

export const ThumbsDownIcon: Icon = createIcon("thumbs-down", [
  [
    "path",
    {
      d: "M9.5 4.5v9.06a1 1 0 0 0 .07.37l1.85 4.71a1.75 1.75 0 0 0 2.66.78l.14-.1a1.5 1.5 0 0 0 .59-1.51l-.57-2.86a1 1 0 0 1 .98-1.2h2.12a2 2 0 0 0 1.97-2.37l-1.26-6.75A2 2 0 0 0 16.09 3H11a1.5 1.5 0 0 0-1.5 1.5",
    },
  ],
  [
    "path",
    {
      d: "M4.25 13.75H5a1.5 1.5 0 0 0 1.5-1.5V4.5A1.5 1.5 0 0 0 5 3h-.75a1.5 1.5 0 0 0-1.5 1.5v7.75a1.5 1.5 0 0 0 1.5 1.5",
    },
  ],
])

export const ThumbsUpIcon: Icon = createIcon("thumbs-up", [
  [
    "path",
    {
      d: "M9.5 19.5v-9.06a1 1 0 0 1 .07-.37l1.85-4.71a1.75 1.75 0 0 1 2.66-.78l.14.1a1.5 1.5 0 0 1 .59 1.51l-.57 2.86a1 1 0 0 0 .98 1.2h2.12a2 2 0 0 1 1.97 2.37l-1.26 6.75A2 2 0 0 1 16.09 21H11a1.5 1.5 0 0 1-1.5-1.5",
    },
  ],
  [
    "path",
    {
      d: "M4.25 10.25H5a1.5 1.5 0 0 1 1.5 1.5v7.75A1.5 1.5 0 0 1 5 21h-.75a1.5 1.5 0 0 1-1.5-1.5v-7.75a1.5 1.5 0 0 1 1.5-1.5",
    },
  ],
])

export const TimerIcon: Icon = createIcon("timer", [
  ["path", { d: "M4.25 13.75a7.75 7.75 0 1 0 15.5 0 7.75 7.75 0 1 0-15.5 0" }],
  ["path", { d: "M10 2.75h4" }],
  ["path", { d: "M12 13.75 14.75 11" }],
])

export const ToolIcon: Icon = createIcon("tool", [
  [
    "path",
    {
      d: "M19.76 6.79a5.25 5.25 0 0 1-7.16 6.88l-6.22 6.21a1.6 1.6 0 0 1-2.26-2.26l6.21-6.22a5.25 5.25 0 0 1 6.88-7.16l-2.42 2.43 2.54 2.54Z",
    },
  ],
])

export const TraceIcon: Icon = createIcon("trace", [
  ["path", { d: "M4 5.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0" }],
  ["path", { d: "M4 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0" }],
  ["path", { d: "M4 18.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0" }],
  ["path", { d: "M5.5 8.25v1" }],
  ["path", { d: "M5.5 14.75v1" }],
  ["path", { d: "M10 5.5h10.5" }],
  ["path", { d: "M10 12h8" }],
  ["path", { d: "M10 18.5h10.5" }],
])

export const TrashIcon: Icon = createIcon("trash", [
  ["path", { d: "M3.5 6h17" }],
  ["path", { d: "M10 3h4" }],
  ["path", { d: "m5.75 9.25.6 9.41A2.5 2.5 0 0 0 8.85 21h6.3a2.5 2.5 0 0 0 2.5-2.34l.6-9.41" }],
])

export const Trash2Icon: Icon = createIcon("trash-2", [
  ["path", { d: "M3.5 6h17" }],
  ["path", { d: "M10 3h4" }],
  ["path", { d: "m5.75 9.25.6 9.41A2.5 2.5 0 0 0 8.85 21h6.3a2.5 2.5 0 0 0 2.5-2.34l.6-9.41" }],
  ["path", { d: "M10 11.5V17" }],
  ["path", { d: "M14 11.5V17" }],
])

export const TrendingDownIcon: Icon = createIcon("trending-down", [
  ["path", { d: "m2.5 9 4.94 4.94a1.5 1.5 0 0 0 2.12 0l2.88-2.88a1.5 1.5 0 0 1 2.12 0l2.9 2.9" }],
  ["path", { d: "M15.5 17.5H19a2 2 0 0 0 2-2V12" }],
])

export const TrendingUpIcon: Icon = createIcon("trending-up", [
  ["path", { d: "m2.5 15 4.94-4.94a1.5 1.5 0 0 1 2.12 0l2.88 2.88a1.5 1.5 0 0 0 2.12 0l2.9-2.9" }],
  ["path", { d: "M15.5 6.5H19a2 2 0 0 1 2 2V12" }],
])

export const TriangleIcon: Icon = createIcon("triangle", [
  [
    "path",
    {
      d: "m13.74 4.64 6.95 12.17a2 2 0 0 1-1.74 2.99H5.05a2 2 0 0 1-1.74-2.99l6.95-12.17a2 2 0 0 1 3.48 0",
    },
  ],
])

export const TriangleAlertIcon: Icon = createIcon("triangle-alert", [
  [
    "path",
    {
      d: "m13.74 4.64 6.95 12.17a2 2 0 0 1-1.74 2.99H5.05a2 2 0 0 1-1.74-2.99l6.95-12.17a2 2 0 0 1 3.48 0",
    },
  ],
  ["path", { d: "M12 9.25V13" }],
  ["path", { d: "M12 16.25h.01" }],
])

export const TrophyIcon: Icon = createIcon("trophy", [
  [
    "path",
    {
      d: "M8 3h8a1.5 1.5 0 0 1 1.5 1.5V9a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 6.5 9V4.5A1.5 1.5 0 0 1 8 3",
    },
  ],
  ["path", { d: "M6.5 9.75a2.75 2.75 0 0 1 0-5.5" }],
  ["path", { d: "M17.5 9.75a2.75 2.75 0 0 0 0-5.5" }],
  ["path", { d: "M12 17.25V21" }],
  ["path", { d: "M7 21h10" }],
])

export const TruckIcon: Icon = createIcon("truck", [
  [
    "path",
    {
      d: "M2.5 16.36a1.5 1.5 0 0 1 0-.11V6.5a2 2 0 0 1 2-2H12a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h2.07a1.5 1.5 0 0 1 1.13.51l2.92 3.31a1.5 1.5 0 0 1 .38 1v2.93a1.5 1.5 0 0 1 0 .11",
    },
  ],
  ["path", { d: "M9.5 17.75a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0" }],
  ["path", { d: "M19.5 17.75a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0" }],
])

export const TypeIcon: Icon = createIcon("type", [
  ["path", { d: "M4.5 7.5v-2A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5v2" }],
  ["path", { d: "M12 7v13" }],
  ["path", { d: "M9 20h6" }],
])

export const Undo2Icon: Icon = createIcon("undo-2", [
  ["path", { d: "M8.25 9h6.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" }],
  ["path", { d: "M8.25 4.5 5.16 7.59a2 2 0 0 0 0 2.82l3.09 3.09" }],
])

export const UnlockIcon: Icon = createIcon("unlock", [
  ["path", { d: "M7 10.5h10a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4.5a3 3 0 0 1 3-3" }],
  ["path", { d: "M8 7.5V7a4 4 0 0 1 7.46-2" }],
])

export const UploadIcon: Icon = createIcon("upload", [
  ["path", { d: "M3.5 15v2.5a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3V15" }],
  ["path", { d: "m16.5 8-3.09-3.09a2 2 0 0 0-2.82 0L7.5 8" }],
  ["path", { d: "M12 15.5V8" }],
])

export const UserIcon: Icon = createIcon("user", [
  ["path", { d: "M7.75 7.75a4.25 4.25 0 1 0 8.5 0 4.25 4.25 0 1 0-8.5 0" }],
  ["path", { d: "M4.75 21v-1.75a4 4 0 0 1 4-4h6.5a4 4 0 0 1 4 4V21" }],
])

export const UserPlusIcon: Icon = createIcon("user-plus", [
  ["path", { d: "M13 7.75a4 4 0 1 1-8 0 4 4 0 1 1 8 0" }],
  ["path", { d: "M2.5 21v-1.5a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4V21" }],
  ["path", { d: "M16.5 10.5h5" }],
  ["path", { d: "M19 8v5" }],
])

export const UserRoundIcon: Icon = createIcon("user-round", [
  ["path", { d: "M7.75 7.5a4.25 4.25 0 1 0 8.5 0 4.25 4.25 0 1 0-8.5 0" }],
  ["path", { d: "M4.76 20.31a7.5 7.5 0 0 1 14.48 0" }],
])

export const UserRoundCheckIcon: Icon = createIcon("user-round-check", [
  ["path", { d: "M5.75 7.5a4.25 4.25 0 1 0 8.5 0 4.25 4.25 0 1 0-8.5 0" }],
  ["path", { d: "M2.76 20.31a7.5 7.5 0 0 1 10.99-4.56" }],
  ["path", { d: "m15.25 18 1.34 1.34a1.25 1.25 0 0 0 1.79-.03l2.87-3.06" }],
])

export const UserXIcon: Icon = createIcon("user-x", [
  ["path", { d: "M5 7.75a4 4 0 1 0 8 0 4 4 0 1 0-8 0" }],
  ["path", { d: "M2.5 21v-1.5a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4V21" }],
  ["path", { d: "m17 8.5 4 4" }],
  ["path", { d: "m21 8.5-4 4" }],
])

export const UsersIcon: Icon = createIcon("users", [
  ["path", { d: "M13 7.75a4 4 0 1 1-8 0 4 4 0 1 1 8 0" }],
  ["path", { d: "M2.5 21v-1.5a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4V21" }],
  ["path", { d: "M15.52 3.76a3.5 3.5 0 0 1 3.73 3.49 3.5 3.5 0 0 1-3.21 3.49" }],
  ["path", { d: "M21.25 21v-3.75a3.75 3.75 0 0 0-3.75-3.75" }],
])

export const UsersRoundIcon: Icon = createIcon("users-round", [
  ["path", { d: "M13 7.75a4 4 0 1 1-8 0 4 4 0 1 1 8 0" }],
  ["path", { d: "M2.24 20.44a7 7 0 0 1 13.52 0" }],
  ["path", { d: "M15.52 3.76a3.5 3.5 0 0 1 3.73 3.49 3.5 3.5 0 0 1-3.21 3.49" }],
  ["path", { d: "M18.23 15.44a7.25 7.25 0 0 1 4.52 4.93" }],
])

export const UtensilsIcon: Icon = createIcon("utensils", [
  ["path", { d: "M7 2.75v18.5" }],
  ["path", { d: "M3.5 2.75V6a2.5 2.5 0 0 0 .71 1.74" }],
  ["path", { d: "M9.79 7.74A2.5 2.5 0 0 0 10.5 6V2.75" }],
  [
    "path",
    {
      d: "M20.5 21.25V5.89a1.25 1.25 0 0 0-2.16-.86l-1.65 1.75A2.5 2.5 0 0 0 16 8.5V13a1.5 1.5 0 0 0 1.5 1.5h.25",
    },
  ],
])

export const VideoIcon: Icon = createIcon("video", [
  ["path", { d: "M5.5 6H12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5.5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3" }],
  [
    "path",
    {
      d: "m18.42 9.95 1.1-.79a1.25 1.25 0 0 1 1.98 1.02v3.64a1.25 1.25 0 0 1-1.98 1.02l-1.1-.79a1 1 0 0 1-.42-.81v-2.48a1 1 0 0 1 .42-.81",
    },
  ],
])

export const VideoOffIcon: Icon = createIcon("video-off", [
  ["path", { d: "m4 4 16 16" }],
  ["path", { d: "M10.24 6H12a3 3 0 0 1 3 3v1.76" }],
  ["path", { d: "M12.47 17.96A3 3 0 0 1 12 18H5.5a3 3 0 0 1-3-3V9a3 3 0 0 1 .16-.95" }],
  [
    "path",
    {
      d: "m18.42 9.95 1.1-.79a1.25 1.25 0 0 1 1.98 1.02v3.64a1.25 1.25 0 0 1-1.98 1.02l-1.1-.79a1 1 0 0 1-.42-.81v-2.48a1 1 0 0 1 .42-.81",
    },
  ],
])

export const Volume1Icon: Icon = createIcon("volume-1", [
  [
    "path",
    {
      d: "M4.5 8.5h1.63a1.5 1.5 0 0 0 1.06-.44l1.68-1.68a1.25 1.25 0 0 1 2.13.89v9.46a1.25 1.25 0 0 1-2.13.89l-1.68-1.68a1.5 1.5 0 0 0-1.06-.44H4.5A1.5 1.5 0 0 1 3 14v-4a1.5 1.5 0 0 1 1.5-1.5",
    },
  ],
  ["path", { d: "M14.93 9.03a4 4 0 0 1 0 5.94" }],
])

export const Volume2Icon: Icon = createIcon("volume-2", [
  [
    "path",
    {
      d: "M4.5 8.5h1.63a1.5 1.5 0 0 0 1.06-.44l1.68-1.68a1.25 1.25 0 0 1 2.13.89v9.46a1.25 1.25 0 0 1-2.13.89l-1.68-1.68a1.5 1.5 0 0 0-1.06-.44H4.5A1.5 1.5 0 0 1 3 14v-4a1.5 1.5 0 0 1 1.5-1.5",
    },
  ],
  ["path", { d: "M14.93 9.03a4 4 0 0 1 0 5.94" }],
  ["path", { d: "M17.18 5.7a8 8 0 0 1 0 12.6" }],
])

export const VolumeXIcon: Icon = createIcon("volume-x", [
  [
    "path",
    {
      d: "M4.5 8.5h1.63a1.5 1.5 0 0 0 1.06-.44l1.68-1.68a1.25 1.25 0 0 1 2.13.89v9.46a1.25 1.25 0 0 1-2.13.89l-1.68-1.68a1.5 1.5 0 0 0-1.06-.44H4.5A1.5 1.5 0 0 1 3 14v-4a1.5 1.5 0 0 1 1.5-1.5",
    },
  ],
  ["path", { d: "m15.25 9.25 5.5 5.5" }],
  ["path", { d: "m20.75 9.25-5.5 5.5" }],
])

export const WalletIcon: Icon = createIcon("wallet", [
  ["path", { d: "M5.75 5h12.5a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5.75a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3" }],
  ["path", { d: "M21.25 10h-2.5a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5h2.5" }],
])

export const WatchIcon: Icon = createIcon("watch", [
  ["path", { d: "M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0" }],
  ["path", { d: "m8.25 7.3.53-3.06A1.5 1.5 0 0 1 10.26 3h3.48a1.5 1.5 0 0 1 1.48 1.24l.53 3.06" }],
  [
    "path",
    { d: "m8.25 16.7.53 3.06A1.5 1.5 0 0 0 10.26 21h3.48a1.5 1.5 0 0 0 1.48-1.24l.53-3.06" },
  ],
])

export const WebSearchIcon: Icon = createIcon("web-search", [
  ["path", { d: "M4 10.75a6.75 6.75 0 1 0 13.5 0 6.75 6.75 0 1 0-13.5 0" }],
  ["path", { d: "m15.75 15.75 4.5 4.5" }],
  ["path", { d: "M10.75 6.25C12 7.5 12.5 9 12.5 10.75s-.5 3.25-1.75 4.5" }],
  ["path", { d: "M10.75 6.25C9.5 7.5 9 9 9 10.75s.5 3.25 1.75 4.5" }],
  ["path", { d: "M6.5 10.75H15" }],
])

export const WifiIcon: Icon = createIcon("wifi", [
  ["path", { d: "M8.99 15.49a4.25 4.25 0 0 1 6.02 0" }],
  ["path", { d: "M5.99 12.49a8.5 8.5 0 0 1 12.02 0" }],
  ["path", { d: "M2.98 9.48a12.75 12.75 0 0 1 18.04 0" }],
  ["path", { d: "M12 18.5h.01" }],
])

export const WindIcon: Icon = createIcon("wind", [
  ["path", { d: "M2.5 8h9a2.75 2.75 0 1 0-2.38-4.12" }],
  ["path", { d: "M2.5 12h15a3 3 0 1 0-2.82-4.03" }],
  ["path", { d: "M2.5 16h11a2.5 2.5 0 1 1-2.17 3.75" }],
])

export const WorkflowIcon: Icon = createIcon("workflow", [
  ["path", { d: "M5 3h3.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" }],
  [
    "path",
    { d: "M15.5 13.5H19a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2h-3.5a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 2-2" },
  ],
  ["path", { d: "M6.75 13.5v1.25a2.5 2.5 0 0 0 2.5 2.5h1.25" }],
])

export const WrapTextIcon: Icon = createIcon("wrap-text", [
  ["path", { d: "M3 6h18" }],
  ["path", { d: "M3 12h15a3 3 0 0 1 0 6h-1.5" }],
  ["path", { d: "m15 15.5-1.62 1.62a1.25 1.25 0 0 0 0 1.76L15 20.5" }],
  ["path", { d: "M3 18h5.5" }],
])

export const XIcon: Icon = createIcon("x", [
  ["path", { d: "m6 6 12 12" }],
  ["path", { d: "m18 6-3.88 3.88" }],
  ["path", { d: "M9.88 14.12 6 18" }],
])

export const ZapIcon: Icon = createIcon("zap", [
  [
    "path",
    {
      d: "M14.5 2.75 9.19 9.82a1.5 1.5 0 0 0 1.43 2.39l2.76-.42a1.5 1.5 0 0 1 1.43 2.39L9.5 21.25",
    },
  ],
])

export const ZoomInIcon: Icon = createIcon("zoom-in", [
  ["path", { d: "M4 10.75a6.75 6.75 0 1 0 13.5 0 6.75 6.75 0 1 0-13.5 0" }],
  ["path", { d: "m15.75 15.75 4.5 4.5" }],
  ["path", { d: "M8 10.75h5.5" }],
  ["path", { d: "M10.75 8v5.5" }],
])

export const ZoomOutIcon: Icon = createIcon("zoom-out", [
  ["path", { d: "M4 10.75a6.75 6.75 0 1 0 13.5 0 6.75 6.75 0 1 0-13.5 0" }],
  ["path", { d: "m15.75 15.75 4.5 4.5" }],
  ["path", { d: "M8 10.75h5.5" }],
])

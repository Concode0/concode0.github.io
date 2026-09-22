import type { TailwindColor } from "./types/tailwind";

const MAP_COLOR_VARIANT_TO_BG: Record<TailwindColor, string> = {
  orange: "bg-orange-500",
  violet: "bg-violet-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  teal: "bg-violet-500",
  cyan: "bg-cyan-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  fushia: "bg-fushia-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
};

const MAP_COLOR_VARIANT_TO_TEXT: Record<TailwindColor, string> = {
  orange: "text-orange-500",
  violet: "text-violet-500",
  red: "text-red-500",
  amber: "text-amber-500",
  yellow: "text-yellow-500",
  lime: "text-lime-500",
  green: "text-green-500",
  emerald: "text-emerald-500",
  teal: "text-violet-500",
  cyan: "text-cyan-500",
  blue: "text-blue-500",
  indigo: "text-indigo-500",
  purple: "text-purple-500",
  fushia: "text-fushia-500",
  pink: "text-pink-500",
  rose: "text-rose-500",
};

const MAP_COLOR_VARIANT_TO_RGB: Record<TailwindColor, string> = {
  orange: "249 115 22",
  violet: "139 92 246",
  red: "239 68 68",
  amber: "245 158 11",
  yellow: "234 179 8",
  lime: "132 204 22",
  green: "34 197 94",
  emerald: "16 185 129",
  teal: "20 184 166",
  cyan: "6 182 212",
  blue: "59 130 246",
  indigo: "99 102 241",
  purple: "168 85 247",
  fushia: "217 70 239",
  pink: "236 72 153",
  rose: "244 63 94",
};

export {
  MAP_COLOR_VARIANT_TO_BG,
  MAP_COLOR_VARIANT_TO_TEXT,
  MAP_COLOR_VARIANT_TO_RGB,
};
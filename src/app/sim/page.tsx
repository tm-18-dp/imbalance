import type { Metadata } from "next";
import { Simulator } from "@/components/Simulator";

export const metadata: Metadata = { title: "Simulator | Imbalance" };

export default function SimPage() {
  return <Simulator />;
}

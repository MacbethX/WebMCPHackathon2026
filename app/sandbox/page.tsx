import Storefront from "./storefront";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sandbox: Andrew's Curio Shelf",
  description: "A small retro shop that exposes three WebMCP tools to agents.",
};

export default function SandboxPage() {
  return <Storefront />;
}

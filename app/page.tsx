import Builder from "./builder/builder";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Toolsmith",
  description: "Paste a page, get WebMCP tools an agent can use, approve every one.",
};

export default function Home() {
  return <Builder />;
}

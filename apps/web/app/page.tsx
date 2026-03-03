import { redirect } from "next/navigation";

// Root → redirect to dashboard (middleware will catch unauthenticated users)
export default function Home() {
  redirect("/dashboard");
}

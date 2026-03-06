import { redirect } from "next/navigation";

// Root → redirect to select-client page (middleware will catch unauthenticated users)
export default function Home() {
  redirect("/clients");
}

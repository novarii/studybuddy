import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { StudyBuddyClient } from "@/components/StudyBuddyClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <StudyBuddyClient />;
}

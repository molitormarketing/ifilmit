import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import FilmIt from "../components/FilmIt";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const userInfo = {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress || "",
    name: user.firstName
      ? `${user.firstName} ${user.lastName || ""}`.trim()
      : user.emailAddresses[0]?.emailAddress,
    role: user.publicMetadata?.role || "agency",
    clientId: user.publicMetadata?.clientId || null,
  };

  return <FilmIt userInfo={userInfo} />;
}

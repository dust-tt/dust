import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import type { NextApiRequest, NextApiResponse } from "next";

export type SessionStatusResponse = {
  isLoggedIn: boolean;
  user?: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SessionStatusResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }

  const session = await getSession(req, res);

  if (!session) {
    return res.status(200).json({ isLoggedIn: false });
  }

  const user = await getUserFromSession(session);

  if (!user) {
    return res.status(200).json({ isLoggedIn: false });
  }

  return res.status(200).json({
    isLoggedIn: true,
    user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  });
}

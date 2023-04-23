import { router, publicProcedure } from './trpc.js';
import { createHTTPServer } from '@trpc/server/adapters/standalone';

import { z } from 'zod';

interface User {
  name: string;
}

const appRouter = router({
  userList: publicProcedure.input(z.string()).query(async (opts) => {
    const { input } = opts;
    // Retrieve users from a datasource, this is an imaginary database
    const users: User[] = [
      { name: 'Milo' },
      { name: 'Mona' },
      { name: 'Amos' },
    ];
    console.log("Thanks for sending a s tring as input: ", input)

    return users;
  }),
});



// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});

server.listen(3002);


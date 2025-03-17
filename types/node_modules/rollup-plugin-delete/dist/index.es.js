import internalDel from 'del';

function del(options = {}) {
  const {
    hook = 'buildStart',
    runOnce = false,
    targets = [],
    verbose = false,
    ...rest
  } = options;

  let deleted = false;

  return {
    name: 'delete',
    [hook]: async () => {
      if (runOnce && deleted) {
        return
      }

      const paths = await internalDel(targets, rest);

      if (verbose || rest.dryRun) {
        const message = rest.dryRun
          ? `Expected files and folders to be deleted: ${paths.length}`
          : `Deleted files and folders: ${paths.length}`;

        console.log(message);

        if (paths.length > 0) {
          paths.forEach((path) => {
            console.log(path);
          });
        }
      }

      deleted = true;
    }
  }
}

export default del;

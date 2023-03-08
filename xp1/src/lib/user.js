import { VARS } from 'variables';

export async function getSecretAndUser() {
  let result = await chrome.storage.sync.get(['app_secret']);
  if (!result.app_secret) {
    return {
      status: 'not_found',
      secret: null,
    };
  } else {
    return await getUser(result.app_secret);
  }
}

export async function getUserFromAPI(secret) {
  let userRes = await fetch(`${VARS.server}/api/xp1/${VARS.api_version}/user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      secret: secret,
    }),
  });

  let user = null;

  if (userRes.status !== 200) {
    user = {
      status: 'invalid',
      secret: secret,
    };
  } else {
    user = await userRes.json();
    user.status = 'ready';
  }

  // console.log('SETTING USER', user);
  await chrome.storage.sync.set({ user: user });

  return user;
}

export async function getUser(secret) {
  let user = null;

  let result = await chrome.storage.sync.get(['user']);
  if (result.user) {
    user = result.user;
  }
  //console.log('USER', user);
  console.log('USER', result);

  if (!user || user.secret !== secret) {
    user = await getUserFromAPI(secret);
  } else {
    // fire and forget an update
    getUserFromAPI(secret);
  }

  return user;
}

export async function setSecret(secret) {
  console.log('SETTING SECRET');
  await chrome.storage.sync.set({ app_secret: secret });
}

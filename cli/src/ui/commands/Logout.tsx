import React, { FC, useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import AuthService from "../../utils/authService.js";
import { normalizeError } from "../../utils/errors.js";

const Logout: FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const performLogout = async () => {
      try {
        setIsLoading(true);
        await AuthService.logout();
        setIsComplete(true);
        setIsLoading(false);
      } catch (err) {
        setError(normalizeError(err).message);
        setIsLoading(false);
      }
    };

    performLogout();
  }, []);

  if (isLoading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text>Logging out...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error during logout: {error}</Text>
      </Box>
    );
  }

  if (isComplete) {
    return (
      <Box flexDirection="column">
        <Text color="green">✓ Successfully logged out</Text>
        <Box marginTop={1}>
          <Text>All authentication tokens have been removed.</Text>
        </Box>
      </Box>
    );
  }

  return null;
};

export default Logout;

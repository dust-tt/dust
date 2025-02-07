import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import ResearchInterface from "./components/ResearchInterface";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

function App() {
  return (
    <MantineProvider
      defaultColorScheme="dark"
      theme={{
        primaryColor: "violet",
        colors: {
          dark: [
            "#C1C2C5",
            "#A6A7AB",
            "#909296",
            "#5C5F66",
            "#373A40",
            "#2C2E33",
            "#25262B",
            "#1A1B1E",
            "#141517",
            "#101113",
          ],
          violet: [
            "#F4EBFF",
            "#E4D3FF",
            "#C9A7FF",
            "#AE7AFF",
            "#9650FF",
            "#7B22FD",
            "#6200EE",
            "#5000C9",
            "#3D00A3",
            "#2A007A",
          ],
        },
        radius: {
          xs: "4px",
          sm: "6px",
          md: "8px",
          lg: "12px",
          xl: "16px",
        },
        shadows: {
          xs: "0 1px 2px rgba(0, 0, 0, 0.2)",
          sm: "0 1px 3px rgba(0, 0, 0, 0.3)",
          md: "0 3px 6px rgba(0, 0, 0, 0.4)",
          lg: "0 5px 15px rgba(0, 0, 0, 0.5)",
          xl: "0 8px 30px rgba(0, 0, 0, 0.6)",
        },
        components: {
          Card: {
            defaultProps: {
              shadow: "md",
              radius: "md",
            },
          },
          Button: {
            defaultProps: {
              radius: "md",
            },
            styles: {
              root: {
                transition: "transform 0.2s ease",
                "&:hover": {
                  transform: "translateY(-1px)",
                },
              },
            },
          },
          Paper: {
            defaultProps: {
              radius: "md",
              shadow: "sm",
            },
          },
        },
      }}
    >
      <Notifications />
      <ResearchInterface />
    </MantineProvider>
  );
}

export default App;

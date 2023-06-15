This extension allows you to index pages from your browsing onto your Dust data sources.

# Setup

- Install the extension from Chrome or Firefox
- Pin it to your toolbar for ease of access
- click on the extension popup and click "Onboard"
- Login to dust if needed
- Then you're set! Click on the popup whenever you want to index something and then pick a data source to upload to


# Dev

For development, install the packages, run `npm install webpack --save-dev` and `npm install web-ext --save-dev`.

Run `npm run start` and start developing, it will reload for you.

For some additional context on the code:

- the content script takes the page contents and sends it back to the background script that sends it to the data source
- the popup onboards you by bringing to your dust workspace and storing the workspace ID, and then it sends a message to the content script whenever you want to index

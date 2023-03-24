const defaultExtractor = () => {
  return document.body.innerText;
};

const whatsappExtractor = () => {
  let mains = document.querySelectorAll("div[id='main']");
  if (mains.length === 1) {
    return mains[0].innerText;
  }
  return document.body.innerText;
};

const discordExtractor = () => {
  let chats = document.querySelectorAll("[class^='chatContent']");
  if (chats.length > 0) {
    let text = chats[chats.length - 1].innerText;
    text = text.replaceAll(/\n\[\n\s*\d+:\d+\s*\n\]\n/g, '\n');
    return text;
  }
  return document.body.innerText;
};

const gmailExtractor = () => {
  let mains = document.querySelectorAll("[role='main']");
  if (mains.length === 1) {
    return mains[0].innerText;
  }
  return document.body.innerText;
};

const stackOverflowExtractor = () => {
  let content = '';
  let questionHeaders = document.querySelectorAll("[id='question-header']");
  if (questionHeaders.length === 1) {
    content += questionHeaders[0].innerText + '\n';
  }
  let mainBars = document.querySelectorAll("[id='mainbar']");
  if (mainBars.length === 1) {
    content += mainBars[0].innerText;
    return content;
  }
  return document.body.innerText;
};

const notionExractor = () => {
  let frames = document.querySelectorAll("[class='notion-frame']");
  if (frames.length === 1) {
    let content = frames[0].innerText;
    let comments = document.querySelectorAll(
      "[class*='notion-update-sidebar-tab-comments-comments-scroller']"
    );
    if (comments.length === 1) {
      content += '\nCOMMENTS:\n';
      content += comments[0].innerText;
    }
    return content;
  }
  return document.body.innerText;
};

const linkedInExtractor = () => {
  let mains = document.querySelectorAll("[id='main']");
  if (mains.length === 1) {
    return mains[0].innerText;
  }
  return document.body.innerText;
};

const twitterExtractor = () => {
  let timelines = document.querySelectorAll("[aria-label$='Home timeline']");
  if (timelines.length === 1) {
    return timelines[0].innerText;
  }
  let details = document.querySelectorAll("[aria-label$='Section details']");
  if (details.length === 1) {
    return details[0].innerText;
  }
  return document.body.innerText;
};

const slackExtractor = () => {
  let secondaries = document.querySelectorAll(
    "[aria-roledescription='Secondary view']"
  );
  if (secondaries.length === 1) {
    return secondaries[0].innerText;
  }
  let primaries = document.querySelectorAll(
    "[aria-roledescription='Primary view']"
  );
  if (primaries.length === 1) {
    return primaries[0].innerText;
  }
  return document.body.innerText;
};

const gdocsExtractor = () => {
  // What an incredible hack.
  // Docs always have script tags with malformed JS
  // that contain `DOCS_modelChunk`s, which can be
  // parsed to reconstruct the entire plain-text doc.
  let contents = Array.from(document.scripts)
    .map((s) => {
      try {
        if (s.innerHTML.toString().startsWith('DOCS_modelChunk =')) {
          return s.innerHTML;
        }
        return null;
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);

  let content = contents
    .map((c) => {
      try {
        const arr = JSON.parse(
          c.split('=', 2)[1].trim().split('},{')[0] + '}]'
        );
        return arr[0].s;
      } catch (e) {}
      return null;
    })
    .filter(Boolean)
    .join('\n');

  if (content.length > 0) {
    return content;
  }

  return document.body.innerText;
};

// eslint-disable-next-line no-unused-vars
const gsheetsExtractor = () => {
  // Another fantastic hack.
  // I don't quite follow their schema but managed to
  // extract something useful when there's no formatting.

  // Ideally this goes in a new file, but that
  // messes up the current script injection setup.
  class Table {
    constructor() {
      this.rows = [];
      this.currentRow = [];
    }

    pushRow() {
      if (this.currentRow.length > 0) {
        this.rows.push(this.currentRow);
        this.currentRow = [];
      }
    }

    appendCell(text) {
      this.currentRow.unshift(text);
    }

    render() {
      return this.rows.map((r) => r.join('\t')).join('\n');
    }

    parseGoogle(document) {
      let data = Array.from(document.scripts).find((s) =>
        s.innerHTML.includes('bootstrapData')
      );
      let parsedData = JSON.parse(
        data.innerHTML.split('bootstrapData = ')[1].split('}}; ')[0] + '}}'
      );
      let sections = parsedData.changes.firstchunk.map((x) => JSON.parse(x[1]));
      for (var section of sections) {
        if (section[2] !== null) {
          continue; // not a text section
        }
        this.parseSection(section);
      }
      return this;
    }

    parseSection(section) {
      var text;
      var index = 0;
      var newIndex = 0;

      for (var cell of section[3]) {
        if ((text = cell[0]?.['3']?.[1])) {
          this.appendCell(text);
          if ((newIndex = cell[0]['6']) > index) {
            this.pushRow();
          }
          index = newIndex;
        } else if (!Object.keys(cell[0]).length) {
          this.pushRow();
        }
      }
    }
  }

  try {
    return new Table().parseGoogle(document).render();
  } catch (e) {
    return document.body.innerText;
  }
};

export function scriptForURL(url) {
  // console.log('scriptForURL', url);
  // get the domain of the URL
  let u = new URL(url);
  // console.log('URL', u);

  switch (u.host) {
    case 'web.whatsapp.com':
      return whatsappExtractor;
    case 'discord.com':
      return discordExtractor;
    case 'mail.google.com':
      return gmailExtractor;
    case 'stackoverflow.com':
      return stackOverflowExtractor;
    case 'www.notion.so':
      return notionExractor;
    case 'www.linkedin.com':
      return linkedInExtractor;
    case 'twitter.com':
      return twitterExtractor;
    case 'app.slack.com':
      return slackExtractor;
    case 'docs.google.com':
      // TODO(spolu): test this
      // if (u.pathname.startsWith('/spreadsheets')) {
      //   return gsheetsExtractor;
      // }
      if (u.pathname.startsWith('/document')) {
        return gdocsExtractor;
      }
      return defaultExtractor;
    default:
      return defaultExtractor;
  }
}

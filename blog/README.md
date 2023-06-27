# Dust Blog
Source code for the dust blog

## How to add a post
### Blog post file
- Create a .mdx file in src/pages
  - copy-paste 
- name it [date]-[keyword-list-with-hyphens].mdx
  - [date]-[keyword-list-with-hyphens] is your post's *id*
- put all the media files for the post under the directory *src/media/[post-id]*
- copy paste the markdown for your blog post in the file
  - don't forget the JS header as in other files
  - use a h2 header for your main title, h3 for subs
  - add a date and your post's id to the h2 header
- update references to media in the blog post .mdx file (img1.gif -> @/media/[post-id]/img1.gif)

See [this example post](src/pages/2023-06-02-speculative-sampling.mdx) for reference
### !! Caveats
- triple-dash must be converted to <Line> component
- mailto links must be hand corrected

### Blog post listing in homepage
Add the post listing on top of the file src/pages/index.mdx. Follow this example
```
![](@/media/2023-06-02-speculative-sampling/example.gif)

## Speculative sampling: how LLMs can write a lot faster using other LLMs {{ date: '2023-06-02T00:00Z', id: '2023-06-02-speculative-sampling' }}

Behind the beautiful name of _Speculative sampling_ lies a neat technique to have a large language model can generate tokens **up to three times faster** 🔥 The technique has been developed by various research teams, including one from Google DeepMind [who published it here](https://arxiv.org/pdf/2302.01318.pdf).
---
```

Main elements
- Header 2 with full article title, {{ date: THE DATE, id: YOUR ARTICLE ID}}
- Article id MUST BE the name of the .mdx file of your blog post
- image at the top
- 3 hyphens at the end

# Dev info
This blog is based on the *Commit* template.
Commit is a [Tailwind UI](https://tailwindui.com) site template built using [Tailwind CSS](https://tailwindcss.com) and [Next.js](https://nextjs.org).

## Getting started

To get started, first install dependencies via npm:

```bash
npm install
```

Next, create a `.env.local` file in the root of your project and set the `NEXT_PUBLIC_SITE_URL` environment variable to your site's public URL:

```
NEXT_PUBLIC_SITE_URL=https://example.com
```

Then start the development server:

```bash
npm run dev
```

Finally, open [http://localhost:3000](http://localhost:3000) in your browser to view the website.

## Customizing

We've tried to build this template exactly the same way we'd build it if it we were building a real website, so there's no weird configuration files or global variables like you might see in a product that has been built as a "theme" rather than as an actual site.

Instead, you make changes by just opening the files you want to change, and changing whatever it is you want to change.

We'll cover a lot of the fundamentals here to help you get going quickly, but at the end of the day the whole codebase is yours and you should feel free to edit everything directly as much as you need to.

### Project structure

The template is built as a pretty standard Next.js website, but using the `src` folder so things like the `pages` directory are located at `./src/pages` instead of being top-level.

### Title and metadata

You can update your site's `<title>` and metadata in `./src/pages/_app.jsx`.

### Hero content

The main hero section for the site that includes your logo, headline, description, and links are all located in `./src/components/Intro.jsx`.

### Adding changelog entries

All of the changelog entries are stored in one big `./src/pages/index.mdx` file. We were inspired to set it up this way by how projects commonly maintain plaintext `CHANGELOG` files, and thought it would be cool to parse this sort of format and turn it into a nicely designed site.

Each changelog entry should be separated by a horizontal rule (`---`) and should include an `<h2>` with a date, specified as an [MDX annotation](https://github.com/bradlc/mdx-annotations):

```md
---

![](@/images/your-screenshot.png)

## My new changelog entry {{ date: '2023-04-06T00:00Z' }}

Your content...
```

### Newsletter

You can find the newsletter sign up form in `./src/components/SignUpForm.jsx` — if you have a newsletter you'll want to wire this up with whatever mailing list software you use to get it to actually work.

### RSS feed

The site will automatically generate an RSS feed at build time based on the content of `./src/pages/index.mdx`.

You can edit the metadata for the feed (like the title and description) in `./src/lib/generateRssFeed.js`.

Make sure to set your `NEXT_PUBLIC_SITE_URL` environment variable as the RSS feed needs this to generate the correct links for each entry.

## License

This site template is a commercial product and is licensed under the [Tailwind UI license](https://tailwindui.com/license).

## Learn more

To learn more about the technologies used in this site template, see the following resources:

- [Tailwind CSS](https://tailwindcss.com/docs) - the official Tailwind CSS documentation
- [Next.js](https://nextjs.org/docs) - the official Next.js documentation
- [Motion One](https://motion.dev/) - the official Motion One documentation
- [MDX](https://mdxjs.com/) - the official MDX documentation

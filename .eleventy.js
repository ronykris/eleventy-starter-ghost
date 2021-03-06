require("dotenv").config();

const cleanCSS = require("clean-css");
const fs = require("fs");
const pluginRSS = require("@11ty/eleventy-plugin-rss");
const localImages = require("./src/_includes/js/eleventy-plugin-local-images.js");
const lazyImages = require("eleventy-plugin-lazyimages");
//const ghostContentAPI = require("@tryghost/content-api");

const htmlMinTransform = require("./src/transforms/html-min-transform.js");
const moment = require("moment");
const downsize = require("downsize");

// Retrieve images. Set to false for faster build times.
let lazyImagesOn = true;
let getImages = true;
/*
// Init Ghost API
const api = new ghostContentAPI({
    url: process.env.GHOST_API_URL,
    key: process.env.GHOST_CONTENT_API_KEY,
    version: "v3"
});
*/
/*
// Strip Ghost domain from urls
const stripDomain = url => {
    return url.replace(process.env.GHOST_API_URL, "");
};
*/
module.exports = function(config) {
    // Minify HTML
    config.addTransform("htmlmin", htmlMinTransform);

    // Assist RSS feed template
    config.addPlugin(pluginRSS);

    // Apply performance attributes to images
    if (lazyImagesOn) {
        config.addPlugin(lazyImages, {
            imgSelector: 'main img', // custom image selector
            cacheFile: ""
        });
    }
/*
    // Copy images over from Ghost
    if (getImages) {
        config.addPlugin(localImages, {
            distPath: "dist",
            assetPath: "/assets/images",
            selector: "img",
            attribute: "data-src", // Lazy images attribute
            verbose: false
        });
    }
*/
    // Inline CSS
    config.addFilter("cssmin", code => {
        return new cleanCSS({}).minify(code).styles;
    });

    config.addFilter("getReadingTime", text => {
        const wordsPerMinute = 200;
        const numberOfWords = text.split(/\s/g).length;
        return Math.ceil(numberOfWords / wordsPerMinute);
    });

    // Date formatting filter
    config.addFilter("htmlDateString", dateObj => {
        return new Date(dateObj).toISOString().split("T")[0];
    });

    // Don't ignore the same files ignored in the git repo
    config.setUseGitIgnore(false);

    // Get all pages, called 'docs' to prevent
    // conflicting the eleventy page object
    config.addCollection("docs", async function(collection) {
        collection = await pages
            .browse({
                include: "authors",
                limit: "all"
            })
            .catch(err => {
                console.error(err);
            });

        collection.map(doc => {
            doc.url = stripDomain(doc.url);
            doc.primary_author.url = stripDomain(doc.primary_author.url);

            // Convert publish date into a Date object
            doc.published_at = new Date(doc.published_at);
            return doc;
        });

        return collection;
    });

    // Get all posts
    config.addCollection("posts", async function(collection) {
        collection = await posts
            .browse({
                include: "tags,authors",
                limit: "all"
            })
            .catch(err => {
                console.error(err);
            });

        collection.forEach(post => {
            post.url = stripDomain(post.url);
            post.primary_author.url = stripDomain(post.primary_author.url);
            post.tags.map(tag => (tag.url = stripDomain(tag.url)));

            // Convert publish date into a Date object
            post.published_at = new Date(post.published_at);
        });

        // Bring featured post to the top of the list
        // collection.sort((post, nextPost) => nextPost.featured - post.featured);

        return collection;
    });

    // Get all authors
    config.addCollection("authors", async function(collection) {
        collection = await authors
            .browse({
                limit: "all"
            })
            .catch(err => {
                console.error(err);
            });

        // Get all posts with their authors attached
        const posts = await posts
            .browse({
                include: "authors",
                limit: "all"
            })
            .catch(err => {
                console.error(err);
            });

        // Attach posts to their respective authors
        collection.forEach(async author => {
            const authorsPosts = posts.filter(post => {
                post.url = stripDomain(post.url);
                return post.primary_author.id === author.id;
            });
            if (authorsPosts.length) author.posts = authorsPosts;

            author.url = stripDomain(author.url);
        });

        return collection;
    });

    // Get all tags
    config.addCollection("tags", async function(collection) {
        collection = await tags
            .browse({
                include: "count.posts",
                limit: "all"
            })
            .catch(err => {
                console.error(err);
            });

        // Get all posts with their tags attached
        const posts = await posts
            .browse({
                include: "tags,authors",
                limit: "all"
            })
            .catch(err => {
                console.error(err);
            });

        // Attach posts to their respective tags
        collection.forEach(async tag => {
            const taggedPosts = posts.filter(post => {
                post.url = stripDomain(post.url);
                return post.primary_tag && post.primary_tag.slug === tag.slug;
            });
            if (taggedPosts.length) tag.posts = taggedPosts;

            tag.url = stripDomain(tag.url);
        });

        return collection;
    });

    // Add shortcode for date format
    config.addShortcode("formatDate", function(date, format) {
        date = new Date(date);
        if ( format == "ISO") {
            var format_date = moment(date).toISOString();
        } else {
            var format_date = moment(date).format(format);
        }
        return format_date;
    });

    // Add shortcode for excerpt truncation
    config.addShortcode("excerpt", function(str) {
        let excerpt = str;
        let characters = 300;

        if (str.length > characters) {
            excerpt = excerpt.split(".");
            one_sentence = excerpt[0] + ".";
            two_sentences = excerpt[0] + "." + excerpt[1] + ".";
            if (two_sentences.length <= characters) {
                return two_sentences;
            }
            else if (one_sentence.length <= characters) {
                return one_sentence;
            } else {
                excerpt = excerpt[0];
                let truncateOptions = {};
                truncateOptions.words = 40;
                return downsize(excerpt, truncateOptions) + "...";
            }
        } else {
            return excerpt;
        }
    });

    // Display 404 page in BrowserSnyc
    config.setBrowserSyncConfig({
        callbacks: {
            ready: (err, bs) => {
                const content_404 = fs.readFileSync("dist/404.html");

                bs.addMiddleware("*", (req, res) => {
                    // Provides the 404 content without redirect.
                    res.write(content_404);
                    res.end();
                });
            }
        }
    });

    // Eleventy configuration
    return {
        dir: {
            input: "src",
            output: "_site"
        },

        // Files read by Eleventy, add as needed
        templateFormats: ["css", "js", "njk", "md", "txt"],
        htmlTemplateEngine: "njk",
        markdownTemplateEngine: "njk",
        passthroughFileCopy: true
    };
};

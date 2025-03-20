// This code is based on the following code:
// https://github.com/mrcoles/full-page-screen-capture-chrome-extension

/**
 * The MIT License
 *
 * Copyright (c) 2012,2013 Peter Coles (http://mrcoles.com/)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import type { CaptureFullPageMessage } from "@app/platforms/chrome/messages";

declare global {
  interface Window {
    hasScreenCapturePage: any;
  }
}
(function () {
  const CAPTURE_DELAY = 150;
  const MAX_PRIMARY_DIMENSION = 5000,
    MAX_SECONDARY_DIMENSION = 3000,
    MAX_AREA = MAX_PRIMARY_DIMENSION * MAX_SECONDARY_DIMENSION;

  if (!window.hasScreenCapturePage) {
    window.hasScreenCapturePage = true;
    chrome.runtime.onMessage.addListener(
      (message: CaptureFullPageMessage, sender, callback) => {
        if (message.type === "PAGE_CAPTURE_FULL_PAGE") {
          try {
            getPositions(callback);
          } catch (error) {
            console.log(error);
            callback([]);
          }
          return true;
        }
      }
    );
  }

  type Screenshot = {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    index: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  };

  function _initScreenshots(totalWidth: number, totalHeight: number) {
    // Create and return an array of screenshot objects based
    // on the `totalWidth` and `totalHeight` of the final image.
    // We have to account for multiple canvases if too large,
    // because Chrome won't generate an image otherwise.
    //
    const badSize =
      totalHeight > MAX_PRIMARY_DIMENSION ||
      totalWidth > MAX_PRIMARY_DIMENSION ||
      totalHeight * totalWidth > MAX_AREA;
    const biggerWidth = totalWidth > totalHeight;
    const maxWidth = !badSize
      ? totalWidth
      : biggerWidth
        ? MAX_PRIMARY_DIMENSION
        : MAX_SECONDARY_DIMENSION;
    const maxHeight = !badSize
      ? totalHeight
      : biggerWidth
        ? MAX_SECONDARY_DIMENSION
        : MAX_PRIMARY_DIMENSION;
    const numCols = Math.ceil(totalWidth / maxWidth);
    const numRows = Math.ceil(totalHeight / maxHeight);

    let canvasIndex = 0;
    const result = [];

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const canvas = document.createElement("canvas");
        canvas.width =
          col == numCols - 1 ? totalWidth % maxWidth || maxWidth : maxWidth;
        canvas.height =
          row == numRows - 1 ? totalHeight % maxHeight || maxHeight : maxHeight;

        const left = col * maxWidth;
        const top = row * maxHeight;

        result.push({
          canvas: canvas,
          ctx: canvas.getContext("2d"),
          index: canvasIndex,
          left: left,
          right: left + canvas.width,
          top: top,
          bottom: top + canvas.height,
        });

        canvasIndex++;
      }
    }

    return result;
  }

  function _filterScreenshots(
    imgLeft: number,
    imgTop: number,
    imgWidth: number,
    imgHeight: number,
    screenshots: Screenshot[]
  ) {
    // Filter down the screenshots to ones that match the location
    // of the given image.
    //
    const imgRight = imgLeft + imgWidth,
      imgBottom = imgTop + imgHeight;
    return screenshots.filter(function (screenshot) {
      return (
        imgLeft < screenshot.right &&
        imgRight > screenshot.left &&
        imgTop < screenshot.bottom &&
        imgBottom > screenshot.top
      );
    });
  }

  function getPositions(callback: (dataUrls: string[]) => void) {
    const body = document.body,
      originalBodyOverflowYStyle = body ? body.style.overflowY : "",
      originalX = window.scrollX,
      originalY = window.scrollY,
      originalOverflowStyle = document.documentElement.style.overflow;

    // try to make pages with bad scrolling work, e.g., ones with
    // `body { overflow-y: scroll; }` can break `window.scrollTo`
    if (body) {
      body.style.overflowY = "visible";
    }

    const widths = [
      document.documentElement.clientWidth,
      body ? body.scrollWidth : 0,
      document.documentElement.scrollWidth,
      body ? body.offsetWidth : 0,
      document.documentElement.offsetWidth,
    ];
    const heights = [
      document.documentElement.clientHeight,
      body ? body.scrollHeight : 0,
      document.documentElement.scrollHeight,
      body ? body.offsetHeight : 0,
      document.documentElement.offsetHeight,
      // (Array.prototype.slice.call(document.getElementsByTagName('*'), 0)
      //  .reduce(function(val, elt) {
      //      var h = elt.offsetHeight; return h > val ? h : val;
      //  }, 0))
    ];
    let fullWidth = Math.max(...widths);
    const fullHeight = Math.max(...heights);
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const arrangements = [];
    // pad the vertical scrolling to try to deal with
    // sticky headers, 250 is an arbitrary size
    const scrollPad = 200;
    const yDelta = windowHeight - (windowHeight > scrollPad ? scrollPad : 0);
    const xDelta = windowWidth;
    let yPos = fullHeight - windowHeight;
    let xPos;

    // During zooming, there can be weird off-by-1 types of things...
    if (fullWidth <= xDelta + 1) {
      fullWidth = xDelta;
    }

    // Disable all scrollbars. We'll restore the scrollbar state when we're done
    // taking the screenshots.
    document.documentElement.style.overflow = "hidden";

    while (yPos > -yDelta) {
      xPos = 0;
      while (xPos < fullWidth) {
        arrangements.push([xPos, yPos]);
        xPos += xDelta;
      }
      yPos -= yDelta;
    }

    const numArrangements = arrangements.length;

    function cleanUp() {
      document.documentElement.style.overflow = originalOverflowStyle;
      if (body) {
        body.style.overflowY = originalBodyOverflowYStyle;
      }
      window.scrollTo(originalX, originalY);
      // Ensure the callback is called at least once when cleaning up.
      // If it was called already with results, this will be ignored by promise.
      callback([]);
    }
    const screenshots: Screenshot[] = [];

    (function processArrangements() {
      const next = arrangements.shift();
      if (!next) {
        if (callback) {
          callback(
            screenshots.map((screenshot) =>
              screenshot.canvas.toDataURL("image/jpeg", 0.8)
            )
          );
        }

        cleanUp();
        return;
      }

      const [x, y] = next;

      window.scrollTo(x, y);

      const data = {
        image: {},
        x: window.scrollX,
        y: window.scrollY,
        complete: (numArrangements - arrangements.length) / numArrangements,
        windowWidth: windowWidth,
        totalWidth: fullWidth,
        totalHeight: fullHeight,
        devicePixelRatio: window.devicePixelRatio,
      };

      const zoomFactor = 1 / window.devicePixelRatio;

      // Need to wait for things to settle
      window.setTimeout(function () {
        // In case the below callback never returns, cleanup
        const cleanUpTimeout = window.setTimeout(cleanUp, 1250);
        chrome.runtime.sendMessage({ type: "CAPTURE" }, function ({ dataURI }) {
          window.clearTimeout(cleanUpTimeout);
          if (dataURI) {
            const image = new Image();
            image.onload = function () {
              data.image = { width: image.width, height: image.height };

              // given device mode emulation or zooming, we may end up with
              // a different sized image than expected, so let's adjust to
              // match it!
              if (data.windowWidth !== image.width) {
                const scale = image.width / data.windowWidth;
                data.x *= scale;
                data.y *= scale;
                data.totalWidth *= scale;
                data.totalHeight *= scale;
              }

              // lazy initialization of screenshot canvases (since we need to wait
              // for actual image size)
              if (!screenshots.length) {
                Array.prototype.push.apply(
                  screenshots,
                  _initScreenshots(
                    data.totalWidth * zoomFactor,
                    data.totalHeight * zoomFactor
                  )
                );
              }

              // draw it on matching screenshot canvases
              _filterScreenshots(
                data.x * zoomFactor,
                data.y * zoomFactor,
                image.width * zoomFactor,
                image.height * zoomFactor,
                screenshots
              ).forEach(function (screenshot) {
                screenshot.ctx.drawImage(
                  image,
                  data.x * zoomFactor - screenshot.left,
                  data.y * zoomFactor - screenshot.top,
                  image.width * zoomFactor,
                  image.height * zoomFactor
                );
              });

              // Move on to capture next arrangement.
              processArrangements();
            };
            image.src = dataURI;
          } else {
            // If there's an error in popup.js, the response value can be
            // undefined, so cleanup
            cleanUp();
          }
        });
      }, CAPTURE_DELAY);
    })();
  }
})();

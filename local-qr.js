(function () {
  "use strict";

  var logoDataUrl = "";
  var qrCanvasDataUrl = "";
  var maxLogoSize = 2 * 1024 * 1024;
  var apiEndpoint = window.QR_API_PROXY || "";

  function isFileMode() {
    return window.location.protocol === "file:";
  }

  function getAngular() {
    return window.angular || (typeof angular !== "undefined" ? angular : null);
  }

  function findScope() {
    var angularApi = getAngular();
    if (!angularApi) return null;
    var elements = document.querySelectorAll(
      ".qrcode-generator, [ng-controller='GeneratorCtrl']",
    );
    for (var index = 0; index < elements.length; index += 1) {
      var angularElement = angularApi.element(elements[index]);
      var scope = angularElement.scope() || angularElement.isolateScope();
      if (scope) return scope;
    }
    return null;
  }

  function digest(scope, callback) {
    var angularApi = getAngular();
    scope.$evalAsync(callback || (angularApi && angularApi.noop));
  }

  function getQrText(scope) {
    return scope.getTypeData(scope.qrcode.type) || " ";
  }

  function getLogoSource(scope) {
    var logo = scope.qrcode.config.logo || "";
    if (logo.charAt(0) === "#") {
      if (isFileMode()) return "";
      return "./img/qr/logos/" + logo.slice(1) + ".svg";
    }
    return logoDataUrl;
  }

  function makeDownload(dataUrl, filename) {
    var link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadPng(dataUrl) {
    if (!/^data:image\/svg\+xml/i.test(dataUrl)) {
      makeDownload(dataUrl, "qr-code.png");
      return;
    }

    var image = new Image();
    image.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1000;
      canvas.height = image.naturalHeight || 1000;
      canvas.getContext("2d").drawImage(image, 0, 0);
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        makeDownload(url, "qr-code.png");
        window.setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
      }, "image/png");
    };
    image.src = dataUrl;
  }

  function canUseApi(scope) {
    return apiEndpoint && !logoDataUrl && scope.qrcode && scope.qrcode.config;
  }

  function buildOfficialApiRequest(scope) {
    var config = window.angular.copy(scope.qrcode.config || {});
    config.logo = config.logo || "";
    config.gradientOnEyes = !!config.gradientOnEyes;
    return {
      data: getQrText(scope),
      config: config,
      size: Number(scope.qrcode.size) || 300,
      download: false,
      file: "svg",
    };
  }

  function delayUntilImageReady(scope, imageUrl, onReady) {
    var image = new Image();
    var isSvgDataUrl = /^data:image\/svg\+xml/i.test(imageUrl);
    var activate = function () {
      try {
        onReady();
      } catch (error) {
        // no-op: keep preview generation from permanently stalling on a decode edge case
      }
    };

    if (isSvgDataUrl) {
      window.setTimeout(activate, 50);
      return;
    }

    image.onload = function () {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        activate();
        return;
      }
      window.setTimeout(function () {
        delayUntilImageReady(scope, imageUrl, onReady);
      }, 50);
    };
    image.onerror = function () {
      activate();
    };
    image.src =
      imageUrl + (imageUrl.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
  }

  function createWithApi(scope, onError) {
    var request = buildOfficialApiRequest(scope);
    fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("QR API returned " + response.status);
        var contentType = response.headers.get("content-type") || "";
        if (/json/i.test(contentType)) {
          return response.json().then(function (result) {
            if (!result.imageUrl)
              throw new Error("QR API returned no image URL");
            var imageUrl = result.imageUrl;
            if (imageUrl.indexOf("//") === 0) imageUrl = "https:" + imageUrl;
            return { imageUrl: imageUrl };
          });
        }
        return response.text().then(function (svgText) {
          if (!svgText || !svgText.trim()) {
            throw new Error("QR API returned empty SVG");
          }
          return {
            imageUrl:
              "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText),
          };
        });
      })
      .then(function (payload) {
        var imageUrl = payload && payload.imageUrl;
        if (!imageUrl) throw new Error("QR API returned no image URL");
        var readyUrl =
          imageUrl.indexOf("data:image") === 0
            ? imageUrl
            : imageUrl + "?" + Date.now();
        delayUntilImageReady(scope, readyUrl, function () {
          finish(scope, readyUrl);
        });
      })
      .catch(onError);
  }

  function drawModule(context, x, y, moduleSize, style) {
    var inset = /dot|circle|circular/.test(style) ? moduleSize * 0.16 : 0;
    var isVerticalZebra = /circle-zebra-vertical/.test(style);
    var isZebra = /circle-zebra/.test(style);
    var isInward = /pointed-in|rounded-in/.test(style);
    var left = x * moduleSize + inset;
    var top = y * moduleSize + inset;
    var size = moduleSize - inset * 2;
    var centerX = left + size / 2;
    var centerY = top + size / 2;
    context.beginPath();
    if (/circle-zebra/.test(style)) {
      context.arc(
        centerX,
        centerY,
        size * (isVerticalZebra ? 0.44 : 0.5),
        0,
        Math.PI * 2,
      );
      context.fill();
      context.fillStyle = context.fillStyle;
      context.fillRect(
        isVerticalZebra ? left : centerX,
        isVerticalZebra ? centerY : top,
        isVerticalZebra ? size : size / 2,
        isVerticalZebra ? size / 2 : size,
      );
      return;
    } else if (/dot|circle|circular/.test(style)) {
      context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    } else if (/diamond|japnese/.test(style)) {
      context.moveTo(centerX, top);
      context.lineTo(left + size, centerY);
      context.lineTo(centerX, top + size);
      context.lineTo(left, centerY);
      context.closePath();
    } else if (/leaf/.test(style)) {
      context.ellipse(
        centerX,
        centerY,
        size * 0.5,
        size * 0.32,
        -Math.PI / 4,
        0,
        Math.PI * 2,
      );
    } else if (/star/.test(style)) {
      for (var point = 0; point < 10; point += 1) {
        var angle = -Math.PI / 2 + (point * Math.PI) / 5;
        var radius = point % 2 ? size * 0.22 : size * 0.5;
        var px = centerX + Math.cos(angle) * radius;
        var py = centerY + Math.sin(angle) * radius;
        point === 0 ? context.moveTo(px, py) : context.lineTo(px, py);
      }
      context.closePath();
    } else if (/pointed-edge-cut/.test(style)) {
      var pointedCut = size * 0.28;
      context.moveTo(centerX, top);
      context.lineTo(left + size - pointedCut, top);
      context.lineTo(left + size, top + pointedCut);
      context.lineTo(left + size, centerY);
      context.lineTo(left + size - pointedCut, top + size);
      context.lineTo(centerX, top + size);
      context.lineTo(left, top + size - pointedCut);
      context.lineTo(left, centerY);
      context.closePath();
    } else if (/rounded-pointed/.test(style)) {
      var pointedInset = moduleSize * 0.04;
      var pointedLeft = left + pointedInset;
      var pointedTop = top + pointedInset;
      var pointedSize = Math.max(0, size - pointedInset * 2);
      var pointedCenterX = pointedLeft + pointedSize / 2;
      var pointedCenterY = pointedTop + pointedSize / 2;
      context.moveTo(pointedCenterX, pointedTop);
      context.lineTo(pointedLeft + pointedSize, pointedCenterY);
      context.lineTo(pointedCenterX, pointedTop + pointedSize);
      context.lineTo(pointedLeft, pointedCenterY);
      context.closePath();
    } else if (/pointed/.test(style)) {
      context.moveTo(centerX, top);
      context.lineTo(left + size, centerY);
      context.lineTo(centerX, top + size);
      context.lineTo(left, centerY);
      context.closePath();
    } else if (/edge-cut/.test(style)) {
      var cut = size * 0.24;
      context.moveTo(left + cut, top);
      context.lineTo(left + size - cut, top);
      context.lineTo(left + size, top + cut);
      context.lineTo(left + size, top + size - cut);
      context.lineTo(left + size - cut, top + size);
      context.lineTo(left + cut, top + size);
      context.lineTo(left, top + size - cut);
      context.lineTo(left, top + cut);
      context.closePath();
    } else if (/round|rounded|smooth|mosaic/.test(style)) {
      var roundedInset = moduleSize * 0.04;
      var roundedLeft = left + roundedInset;
      var roundedTop = top + roundedInset;
      var roundedSize = Math.max(0, size - roundedInset * 2);
      var roundedRadius = Math.min(
        roundedSize / 2,
        roundedSize * (/mosaic/.test(style) ? 0.12 : isInward ? 0.46 : 0.3),
      );
      context.roundRect(
        roundedLeft,
        roundedTop,
        roundedSize,
        roundedSize,
        roundedRadius,
      );
    } else {
      context.rect(left, top, size, size);
    }
    context.fill();
  }

  function rotateShape(context, centerX, centerY, rotations) {
    context.translate(centerX, centerY);
    (rotations || []).forEach(function (rotation) {
      if (rotation === "fh") context.scale(-1, 1);
      if (rotation === "fv") context.scale(1, -1);
    });
    context.translate(-centerX, -centerY);
  }

  function fillShape(context, left, top, size, style) {
    var centerX = left + size / 2;
    var centerY = top + size / 2;
    var radius = size * (/frame(1|4|7|10|13|14|16)/.test(style) ? 0.18 : 0.3);
    if (/^frame(4|7|8|10|11|16)$/.test(style)) {
      var dotSize =
        size *
        (style === "frame10" ? 0.11 : style === "frame11" ? 0.075 : 0.055);
      var dotRadius = Math.max(1, dotSize / 2);
      var dotCount = style === "frame16" ? 8 : 12;
      context.save();
      context.fillStyle = context.fillStyle;
      for (var dotIndex = 0; dotIndex < dotCount; dotIndex += 1) {
        var dotPosition = (dotIndex + 0.5) / dotCount;
        [
          [left + dotPosition * size, top + dotRadius],
          [left + size - dotRadius, top + dotPosition * size],
          [left + (1 - dotPosition) * size, top + size - dotRadius],
          [left + dotRadius, top + (1 - dotPosition) * size],
        ].forEach(function (point) {
          context.beginPath();
          context.arc(point[0], point[1], dotRadius, 0, Math.PI * 2);
          context.fill();
        });
      }
      context.restore();
      return;
    }
    if (style === "frame6") {
      var frameCut = size * 0.22;
      context.beginPath();
      context.moveTo(left + frameCut, top);
      context.lineTo(left + size - frameCut, top);
      context.lineTo(left + size, top + frameCut);
      context.lineTo(left + size, top + size - frameCut);
      context.lineTo(left + size - frameCut, top + size);
      context.lineTo(left + frameCut, top + size);
      context.lineTo(left, top + size - frameCut);
      context.lineTo(left, top + frameCut);
      context.closePath();
      context.fill();
      return;
    }
    if (style === "frame14") {
      context.beginPath();
      context.moveTo(left + size * 0.08, top);
      context.lineTo(left + size, top + size * 0.08);
      context.lineTo(left + size * 0.92, top + size);
      context.lineTo(left, top + size * 0.92);
      context.closePath();
      context.fill();
      return;
    }
    if (style === "frame1" || style === "frame2") {
      var cornerRadius = size * 0.34;
      var roundLeft = style === "frame1";
      context.beginPath();
      if (roundLeft) {
        context.moveTo(left + cornerRadius, top);
        context.lineTo(left + size, top);
        context.lineTo(left + size, top + size - cornerRadius);
        context.quadraticCurveTo(
          left + size,
          top + size,
          left + size - cornerRadius,
          top + size,
        );
        context.lineTo(left, top + size);
        context.lineTo(left, top + cornerRadius);
        context.quadraticCurveTo(left, top, left + cornerRadius, top);
      } else {
        context.moveTo(left, top);
        context.lineTo(left + size - cornerRadius, top);
        context.quadraticCurveTo(
          left + size,
          top,
          left + size,
          top + cornerRadius,
        );
        context.lineTo(left + size, top + size);
        context.lineTo(left + cornerRadius, top + size);
        context.quadraticCurveTo(
          left,
          top + size,
          left,
          top + size - cornerRadius,
        );
        context.closePath();
      }
      context.closePath();
      context.fill();
      return;
    }
    if (style === "frame5") {
      context.beginPath();
      context.moveTo(left + size * 0.28, top);
      context.lineTo(left + size * 0.76, top);
      context.quadraticCurveTo(
        left + size,
        top,
        left + size,
        top + size * 0.24,
      );
      context.lineTo(left + size, top + size * 0.72);
      context.quadraticCurveTo(
        left + size,
        top + size,
        left + size * 0.72,
        top + size,
      );
      context.lineTo(left + size * 0.28, top + size);
      context.quadraticCurveTo(
        left,
        top + size,
        left + size * 0.08,
        top + size * 0.72,
      );
      context.lineTo(left + size * 0.16, top + size * 0.24);
      context.quadraticCurveTo(
        left + size * 0.18,
        top,
        left + size * 0.28,
        top,
      );
      context.closePath();
      context.fill();
      return;
    }
    if (style === "ball3") {
      var originalBall3 = new Path2D(
        "M100.061,99.984V0h-100l0.028,72.369C0.088,87.602,12.27,100,27.226,100h45.528c4.682,0,11.508,0,17.171-0.016C95.574,99.984,100.061,99.984,100.061,99.984z",
      );
      context.save();
      context.translate(left, top);
      context.scale(size / 100, size / 100);
      context.fill(originalBall3);
      context.restore();
      return;
    }
    if (style === "frame3") {
      var originalFrame3 = new Path2D(
        "M100,100V65.859V34.141C100,25.65,100,0,100,0S76.46,0,66.25,0H0l0.02,65.859C0.02,84.68,15.16,100,33.78,100h32.47H100z M85,85H33.78c-10.344,0-18.76-8.586-18.76-19.145L15.004,15H85V85z",
      );
      context.save();
      context.translate(left, top);
      context.scale(size / 100, size / 100);
      context.fill(originalFrame3, "evenodd");
      context.restore();
      return;
    }
    context.beginPath();
    if (/^ball1$|^frame1$/.test(style)) {
      context.moveTo(left, top);
      context.lineTo(left + size - radius, top);
      context.quadraticCurveTo(left + size, top, left + size, top + radius);
      context.lineTo(left + size, top + size - radius);
      context.quadraticCurveTo(
        left + size,
        top + size,
        left + size - radius,
        top + size,
      );
      context.lineTo(left, top + size);
      context.closePath();
    } else if (/^ball2$|^frame2$/.test(style)) {
      context.moveTo(left + radius, top);
      context.lineTo(left + size, top);
      context.lineTo(left + size, top + size);
      context.lineTo(left, top + size);
      context.lineTo(left, top + radius);
      context.quadraticCurveTo(left, top, left + radius, top);
      context.closePath();
    } else if (/^frame3$/.test(style)) {
      context.moveTo(left, top);
      context.lineTo(left + size, top);
      context.lineTo(left + size, top + size - radius);
      context.quadraticCurveTo(
        left + size,
        top + size,
        left + size - radius,
        top + size,
      );
      context.lineTo(left + radius, top + size);
      context.quadraticCurveTo(left, top + size, left, top + size - radius);
      context.closePath();
    } else if (/^frame12$|^ball14$|^ball18$|^circle$|^circular$/.test(style)) {
      context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    } else if (/^frame6$|^ball16$|diamond|japnese/.test(style)) {
      context.moveTo(centerX, top);
      context.lineTo(left + size, centerY);
      context.lineTo(centerX, top + size);
      context.lineTo(left, centerY);
      context.closePath();
    } else if (/star/.test(style)) {
      for (var point = 0; point < 10; point += 1) {
        var angle = -Math.PI / 2 + (point * Math.PI) / 5;
        var pointRadius = point % 2 ? size * 0.22 : size * 0.5;
        var pointX = centerX + Math.cos(angle) * pointRadius;
        var pointY = centerY + Math.sin(angle) * pointRadius;
        point === 0
          ? context.moveTo(pointX, pointY)
          : context.lineTo(pointX, pointY);
      }
      context.closePath();
    } else if (/pointed/.test(style)) {
      context.moveTo(centerX, top);
      context.lineTo(left + size, centerY);
      context.lineTo(centerX, top + size);
      context.lineTo(left, centerY);
      context.closePath();
    } else if (/edge-cut/.test(style)) {
      var cut = size * 0.24;
      context.moveTo(left + cut, top);
      context.lineTo(left + size - cut, top);
      context.lineTo(left + size, top + cut);
      context.lineTo(left + size, top + size - cut);
      context.lineTo(left + size - cut, top + size);
      context.lineTo(left + cut, top + size);
      context.lineTo(left, top + size - cut);
      context.lineTo(left, top + cut);
      context.closePath();
    } else if (
      /^frame4$|^frame5$|^frame7$|^frame8$|^frame10$|^frame11$|^frame13$|^frame14$|^frame16$|round|rounded|smooth|mosaic/.test(
        style,
      )
    ) {
      context.roundRect(left, top, size, size, radius);
    } else if (
      /^ball5$|^ball7$|^ball9$|^ball10$|^ball12$|^ball13$|^ball15$|^ball18$/.test(
        style,
      )
    ) {
      context.arc(centerX, centerY, size * 0.44, 0, Math.PI * 2);
    } else {
      context.rect(left, top, size, size);
    }
    context.fill();
  }

  function isFinderModule(row, column, moduleCount) {
    return (
      (row < 7 && column < 7) ||
      (row < 7 && column >= moduleCount - 7) ||
      (row >= moduleCount - 7 && column < 7)
    );
  }

  function getEyeFrameAssetPath(style) {
    var frameFiles = {
      frame0: "01.frame0.png",
      frame1: "02.frame1.png",
      frame2: "03.frame2.png",
      frame3: "04.frame3.png",
      frame4: "05.frame4.png",
      frame5: "06.frame5.png",
      frame6: "07.frame6.png",
      frame7: "08.frame7.png",
      frame8: "09.frame8.png",
      frame10: "10.frame10.png",
      frame11: "11.frame11.png",
      frame12: "12.frame12.png",
      frame13: "13.frame13.png",
      frame14: "14.frame14.png",
      frame16: "15.frame16.png",
    };
    return frameFiles[style] ? "./img/qr/eye-frames/" + frameFiles[style] : "";
  }

  function getEyeBallAssetPath(style) {
    var ballFiles = {
      ball0: "01.ball0.png",
      ball1: "02.ball1.png",
      ball2: "03.ball2.png",
      ball3: "04.ball3.png",
      ball5: "05.ball5.png",
      ball6: "06.ball6.png",
      ball7: "07.ball7.png",
      ball8: "08.ball8.png",
      ball10: "09.ball10.png",
      ball11: "10.ball11.png",
      ball12: "11.ball12.png",
      ball13: "12.ball13.png",
      ball14: "13.ball14.png",
      ball15: "14.ball15.png",
      ball16: "15.ball16.png",
      ball17: "16.ball17.png",
      ball18: "17.ball18.png",
      ball19: "18.ball19.png",
    };
    return ballFiles[style] ? "./img/qr/eye-balls/" + ballFiles[style] : "";
  }

  function loadEyeFrameAsset(style, onReady) {
    if (isFileMode()) {
      onReady(null);
      return;
    }
    var image = new Image();
    var path = getEyeFrameAssetPath(style);
    var settled = false;
    var finishLoad = function (asset) {
      if (settled) return;
      settled = true;
      onReady(asset);
    };
    if (!path) {
      finishLoad(null);
      return;
    }
    image.onload = function () {
      finishLoad(image);
    };
    image.onerror = function () {
      finishLoad(null);
    };
    image.src = path;
    window.setTimeout(function () {
      finishLoad(null);
    }, 800);
  }

  function loadEyeBallAsset(style, onReady) {
    if (isFileMode()) {
      onReady(null);
      return;
    }
    var image = new Image();
    var path = getEyeBallAssetPath(style);
    var settled = false;
    var finishLoad = function (asset) {
      if (settled) return;
      settled = true;
      onReady(asset);
    };
    if (!path) {
      finishLoad(null);
      return;
    }
    image.onload = function () {
      finishLoad(image);
    };
    image.onerror = function () {
      finishLoad(null);
    };
    image.src = path;
    window.setTimeout(function () {
      finishLoad(null);
    }, 800);
  }

  function drawFrameAsset(context, image, left, top, size, color) {
    var mask = document.createElement("canvas");
    var maskContext = mask.getContext("2d");
    mask.width = Math.ceil(size);
    mask.height = Math.ceil(size);
    maskContext.drawImage(image, 0, 0, size, size);
    maskContext.globalCompositeOperation = "source-in";
    maskContext.fillStyle = color;
    maskContext.fillRect(0, 0, size, size);
    context.save();
    context.globalCompositeOperation = "source-over";
    context.drawImage(mask, left, top);
    context.restore();
  }

  function drawFinder(
    context,
    x,
    y,
    moduleSize,
    frameStyle,
    ballStyle,
    frameRotations,
    ballRotations,
    foreground,
    background,
    frameAsset,
    ballAsset,
  ) {
    var outer = moduleSize * 7;
    var centerX = x * moduleSize + outer / 2;
    var centerY = y * moduleSize + outer / 2;
    context.save();
    rotateShape(context, centerX, centerY, frameRotations);
    context.fillStyle = foreground;
    if (frameAsset) {
      drawFrameAsset(
        context,
        frameAsset,
        x * moduleSize,
        y * moduleSize,
        outer,
        foreground,
      );
    } else {
      fillShape(context, x * moduleSize, y * moduleSize, outer, frameStyle);
      if (frameStyle !== "frame3") {
        context.fillStyle = background;
        fillShape(
          context,
          (x + 1) * moduleSize,
          (y + 1) * moduleSize,
          moduleSize * 5,
          frameStyle,
        );
      }
    }
    context.restore();

    context.save();
    rotateShape(context, centerX, centerY, ballRotations);
    context.fillStyle = foreground;
    if (ballAsset) {
      drawFrameAsset(
        context,
        ballAsset,
        (x + 2) * moduleSize,
        (y + 2) * moduleSize,
        moduleSize * 3,
        foreground,
      );
    } else {
      fillShape(
        context,
        (x + 2) * moduleSize,
        (y + 2) * moduleSize,
        moduleSize * 3,
        ballStyle,
      );
    }
    context.restore();
  }

  function drawFinders(
    context,
    moduleCount,
    moduleSize,
    config,
    foreground,
    background,
    onDone,
  ) {
    loadEyeFrameAsset(config.eye || "frame0", function (frameAsset) {
      loadEyeBallAsset(config.eyeBall || "ball0", function (ballAsset) {
        drawFinder(
          context,
          0,
          0,
          moduleSize,
          config.eye || "frame0",
          config.eyeBall || "ball0",
          config.erf1,
          config.brf1,
          foreground,
          background,
          frameAsset,
          ballAsset,
        );
        drawFinder(
          context,
          moduleCount - 7,
          0,
          moduleSize,
          config.eye || "frame0",
          config.eyeBall || "ball0",
          config.erf2,
          config.brf2,
          foreground,
          background,
          frameAsset,
          ballAsset,
        );
        drawFinder(
          context,
          0,
          moduleCount - 7,
          moduleSize,
          config.eye || "frame0",
          config.eyeBall || "ball0",
          config.erf3,
          config.brf3,
          foreground,
          background,
          frameAsset,
          ballAsset,
        );
        onDone();
      });
    });
  }

  function composeQr(scope, qrInstance, qrSource) {
    var matrix = qrInstance && qrInstance._oQRCode;
    if (!matrix) return;
    var canvas = document.createElement("canvas");
    var size = Number(scope.qrcode.size) || 1000;
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext("2d");
    var config = scope.qrcode.config;
    var moduleCount = matrix.getModuleCount();
    var quietZone = Math.max(12, Math.round(size * 0.045));
    var qrSize = size - quietZone * 2;
    var moduleSize = qrSize / moduleCount;
    var foreground = config.bodyColor || "#000000";
    var background = config.bgColor || "#FFFFFF";
    var gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, config.gradientColor1 || foreground);
    gradient.addColorStop(1, config.gradientColor2 || foreground);
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);
    context.save();
    context.strokeStyle =
      config.gradientColor1 && config.gradientColor2 ? gradient : foreground;
    context.lineWidth = Math.max(3, Math.round(size * 0.012));
    context.beginPath();
    context.roundRect(
      context.lineWidth / 2,
      context.lineWidth / 2,
      size - context.lineWidth,
      size - context.lineWidth,
      Math.max(12, Math.round(size * 0.035)),
    );
    context.stroke();
    context.translate(quietZone, quietZone);
    context.fillStyle =
      config.gradientColor1 && config.gradientColor2 ? gradient : foreground;
    context.imageSmoothingEnabled = false;
    for (var row = 0; row < moduleCount; row += 1) {
      for (var column = 0; column < moduleCount; column += 1) {
        if (
          matrix.isDark(row, column) &&
          !isFinderModule(row, column, moduleCount)
        ) {
          drawModule(context, column, row, moduleSize, config.body || "square");
        }
      }
    }
    drawFinders(
      context,
      moduleCount,
      moduleSize,
      config,
      foreground,
      background,
      function () {
        context.restore();
        var qrDataUrl = canvas.toDataURL("image/png");
        var logoSource = getLogoSource(scope);
        if (logoSource) {
          var logo = new Image();
          var logoSettled = false;
          var finishWithoutLogo = function () {
            if (logoSettled) return;
            logoSettled = true;
            finish(scope, qrDataUrl);
          };
          logo.onload = function () {
            if (logoSettled) return;
            logoSettled = true;
            try {
              var logoSize = Math.round(qrSize * 0.2);
              var x = Math.round(quietZone + (qrSize - logoSize) / 2);
              var y = Math.round(quietZone + (qrSize - logoSize) / 2);
              context.fillStyle = scope.qrcode.config.bgColor || "#FFFFFF";
              context.fillRect(x - 12, y - 12, logoSize + 24, logoSize + 24);
              context.drawImage(logo, x, y, logoSize, logoSize);
              finish(scope, canvas.toDataURL("image/png"));
            } catch (error) {
              finish(scope, qrDataUrl);
            }
          };
          logo.onerror = function () {
            finishWithoutLogo();
          };
          logo.src = logoSource;
          window.setTimeout(finishWithoutLogo, 1200);
        } else {
          finish(scope, qrDataUrl);
        }
      },
    );
  }

  function finish(scope, dataUrl) {
    qrCanvasDataUrl = dataUrl;
    var previewImage = document.querySelector(".preview img");
    if (previewImage) {
      previewImage.src = dataUrl;
    }
    digest(scope, function () {
      var angularApi = getAngular();
      scope.qrcodePreview = dataUrl;
      scope.tempQrcode =
        angularApi && angularApi.copy
          ? angularApi.copy(scope.qrcode)
          : scope.qrcode;
      scope.isLoading = false;
      scope.generateActive = true;
      if (scope._qrPendingRefresh) {
        scope._qrPendingRefresh = false;
        window.setTimeout(function () {
          scope.createLocalQr();
        }, 0);
      }
    });
  }

  function generateStandalone(scope) {
    var qrCodeConstructor =
      window.QRCode || (typeof QRCode !== "undefined" ? QRCode : null);
    if (!qrCodeConstructor) return;
    scope.isLoading = true;
    var holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-10000px";
    holder.style.top = "-10000px";
    document.body.appendChild(holder);
    var qrInstance = new qrCodeConstructor(holder, {
      text: getQrText(scope),
      width: 1000,
      height: 1000,
      colorDark: scope.qrcode.config.bodyColor || "#000000",
      colorLight: scope.qrcode.config.bgColor || "#FFFFFF",
      correctLevel: qrCodeConstructor.CorrectLevel.H,
    });
    if (!qrInstance._oQRCode && typeof qrInstance.makeCode === "function") {
      qrInstance.makeCode(getQrText(scope));
    }
    var composeWhenReady = function (attempt) {
      if (qrInstance && qrInstance._oQRCode) {
        try {
          composeQr(scope, qrInstance, holder);
        } catch (error) {
          scope.isLoading = false;
          digest(scope);
        }
        holder.remove();
        return;
      }
      if (attempt < 40) {
        window.setTimeout(function () {
          composeWhenReady(attempt + 1);
        }, 50);
        return;
      }
      holder.remove();
      scope.isLoading = false;
      digest(scope);
    };
    composeWhenReady(0);
  }

  window.localQrGenerate = generateStandalone;

  function attach(scope) {
    var refreshTimer = null;
    scope.isLoading = false;
    scope.generateActive = true;

    function queueRefresh() {
      scope.generateActive = true;
      if (!qrCanvasDataUrl) return;
      if (scope.isLoading) {
        scope._qrPendingRefresh = true;
        return;
      }
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(function () {
        scope.createLocalQr();
      }, 120);
    }

    scope.onLocalLogoSelect = function (files) {
      var file = files && files[0];
      if (!file || file.type.indexOf("image/") !== 0) return;
      if (file.size > maxLogoSize) {
        scope.fileSizeError = true;
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        digest(scope, function () {
          logoDataUrl = reader.result;
          scope.logoPreview = logoDataUrl;
          scope.qrcode.config.logo = "local-logo";
          scope.fileSizeError = false;
          scope.generateActive = true;
        });
      };
      reader.readAsDataURL(file);
    };

    scope.createLocalQr = function () {
      var qrCodeConstructor =
        window.QRCode || (typeof QRCode !== "undefined" ? QRCode : null);
      if (scope.isLoading) {
        scope._qrPendingRefresh = true;
        return;
      }
      scope.isLoading = true;
      if (canUseApi(scope)) {
        createWithApi(scope, function () {
          createWithLocalRenderer(scope, qrCodeConstructor);
        });
        return;
      }
      createWithLocalRenderer(scope, qrCodeConstructor);
    };

    function createWithLocalRenderer(scope, qrCodeConstructor) {
      if (!qrCodeConstructor) {
        scope.isLoading = false;
        return;
      }
      var holder = document.createElement("div");
      holder.style.position = "fixed";
      holder.style.left = "-10000px";
      holder.style.top = "-10000px";
      document.body.appendChild(holder);
      var qrInstance = new qrCodeConstructor(holder, {
        text: getQrText(scope),
        width: 1000,
        height: 1000,
        colorDark: scope.qrcode.config.bodyColor || "#000000",
        colorLight: scope.qrcode.config.bgColor || "#FFFFFF",
        correctLevel: qrCodeConstructor.CorrectLevel.H,
      });
      if (!qrInstance._oQRCode && typeof qrInstance.makeCode === "function") {
        qrInstance.makeCode(getQrText(scope));
      }
      var composeWhenReady = function (attempt) {
        if (qrInstance && qrInstance._oQRCode) {
          try {
            composeQr(scope, qrInstance, holder);
          } catch (error) {
            scope.isLoading = false;
            digest(scope);
          }
          holder.remove();
          return;
        }
        if (attempt < 40) {
          window.setTimeout(function () {
            composeWhenReady(attempt + 1);
          }, 50);
          return;
        }
        holder.remove();
        scope.isLoading = false;
        digest(scope);
      };
      composeWhenReady(0);
      window.setTimeout(function () {
        if (!scope.isLoading) return;
        var fallbackCanvas = holder.querySelector("canvas");
        if (fallbackCanvas) {
          finish(scope, fallbackCanvas.toDataURL("image/png"));
        } else {
          scope.isLoading = false;
          digest(scope);
        }
        holder.remove();
      }, 10000);
    }

    scope.downloadLocalQr = function (format) {
      if (!qrCanvasDataUrl) {
        scope.createLocalQr();
        return;
      }
      if (format === "svg" && /^data:image\/svg\+xml/i.test(qrCanvasDataUrl)) {
        makeDownload(qrCanvasDataUrl, "qr-code.svg");
        return;
      }
      downloadPng(qrCanvasDataUrl);
    };

    var designReady = false;
    scope.$watchGroup(
      [
        "qrcode.config.logo",
        "qrcode.config.body",
        "qrcode.config.eye",
        "qrcode.config.eyeBall",
        "qrcode.config.bodyColor",
        "qrcode.config.bgColor",
        "qrcode.config.gradientColor1",
        "qrcode.config.gradientColor2",
      ],
      function () {
        if (!designReady) {
          designReady = true;
          return;
        }
        queueRefresh();
      },
    );
    scope.$watch("qrcode.data", queueRefresh, true);
    scope.$watch("qrcode.type", queueRefresh);
  }

  var tries = 0;
  var timer = window.setInterval(function () {
    var scope = findScope();
    if (scope) {
      window.clearInterval(timer);
      attach(scope);
    } else if (++tries > 100) {
      window.clearInterval(timer);
    }
  }, 100);
})();

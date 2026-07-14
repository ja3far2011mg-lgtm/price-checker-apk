# Price Checker — Android APK Builder

This repository automatically builds an Android APK of the Price Checker app
using GitHub Actions — no local installation needed.

## How to get the APK

1. Go to the **Actions** tab above.
2. Click the most recent workflow run (should show a green checkmark ✅ once finished).
3. Scroll down to **Artifacts** and click **price-checker-apk** to download the `.apk` file.
4. Transfer that file to your Android phone and tap it to install
   (you may need to allow "Install from unknown sources" in your phone's settings).

## How it works

Every time files in this repository change, GitHub automatically:
1. Sets up Java, Node.js, and the Android build tools
2. Wraps the `www/` folder (the same HTML/CSS/JS as the Windows app) into an Android app shell
3. Compiles it into an installable `.apk` file
4. Makes it available for download under the Actions tab

No Android Studio, SDK, or command line needed on your own computer.

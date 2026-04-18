![DreamRT Logo](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamRT_HORZ_wp.png)

# DreamRT - Uark Electroencephalogram Capstone Project
**August 2025 - May 2026<br>
Collaboration between Computer Science and Computer Engineering, Electrical Engineering, and Biomedical Engineering Capstone teams**
<br><br>
**Table of Contents:**<br>
&emsp;\* [Project Overview](#project-overview)<br>
&emsp;* [R - Reader](#r---reader)<br>
&emsp;&emsp;- [Device Setup](#device-setup)<br>
&emsp;&emsp;- [Preparing for Session](#preparing-for-session)<br>
&emsp;\* [T - Tracer](#t---tracer)<br>
&emsp;&emsp;- [System Requirements](#system-requirements)<br>
&emsp;&emsp;- [Installation](#installation)<br>
&emsp;&emsp;&emsp;- [Python](#python)<br>
&emsp;&emsp;&emsp;- [React](#react)<br>
&emsp;&emsp;&emsp;- [Codebase](#codebase)<br>
&emsp;&emsp;- [User Accounts](#user-accounts)<br>
&emsp;&emsp;&emsp;- [Account Creation](#account-creation)<br>
&emsp;&emsp;&emsp;- [User Settings](#user-settings)<br>
&emsp;&emsp;- [Navigation](#navigation)<br>
&emsp;&emsp;- [Session Recording](#session-recording)<br>
&emsp;&emsp;- [Session Review](#session-review)<br>
&emsp;&emsp;- [Debug Mode](#debug-mode)<br>
&emsp;\* [Contributions](#contributions)<br>
&emsp;&emsp;- [Computer Science and Computer Engineering](#computer-science-and-computer-engineering)<br>
&emsp;&emsp;- [Electrical Engineering](#electrical-engineering)<br>
&emsp;&emsp;- [Biomedical Engineering](#biomedical-engineering)<br>


# Project Overview
Sleep monitoring via electroencephalograms (EEG) is critical for diagnosing and tracking neurological conditions and sleep health. However, traditional EEG systems are often cumbersome and uncomfortable for users due to lengthy setup procedures which involve multiple wired nodes and conductive gels. These elements make current EEG devices disruptive during usage, restricting their effectiveness in being an accessible, long-term method of sleep tracking for consumers. There have been commercial EEG-based sleep trackers; however, the market currently has no ergonomic, sub-$200 EEG for monitoring sleep health in a consumer's home.<br><br> 
To address this market gap, this project seeks to create a wireless EEG system designed for ease of use, comfort, and portability. Our wireless device will transmit brainwave reading data via [Bluetooth Low Energy](https://en.wikipedia.org/wiki/Bluetooth_Low_Energy) (BLE), enabling real-time monitoring without the constraints of traditional setups. The tracer software is used to visualize and store the transmitted data privately for each user, allowing them to securely track their personal sleep patterns over time. This software solution aims to provide consumers with tools and resources to utilize this efficient EEG model. Both components provide greater data transparency and control for users, expanding its commercial market.<br><br>
<img src="https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamRT_Architecture_Overview.jpg" width="75%"></img><br><br>
This project is comprised of two components. The [EEG board](#r---reader) was designed and produced by the [Electrical Engineering Capstone Team](#electrical-engineering). The [Software Tracer](#t---tracer) was developed by the [Computer Science and Computer Engineering Capstone Team](#computer-science-and-computer-engineering). There are four key components to this project. The user interacts with the EEG board and frontend components to capture and visualize EEG data. The board and frontend communicate with the backend, which processes the received data for visualizing while maintaining integrity and authenticity standards. The local directory database is used to house encrypted files.
# R - Reader
![DreamR Logo](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamR_HORZ_wp.png)
## Device Setup
Device setup is simple and straightforward. Ensure battery is charged, and nodes are clean. Place device on user's head. It should sit comfortably.<br>
Correct device orientation has two nodes above the eyes.
## Preparing for Session
Device communication with the software can be achieved in two ways:<br>
* BLE (preferred)
* USB-C cable

Both rely on the device being turned on. With the device on, you must [navigate](#navigation) the visualizer to find the scan button. Once it is pressed, it will connect to the device.<br>
A successful connection will result in a blinking light on the device, and data being received and plotted on the visualizer.<br>
>[!IMPORTANT]
>It may take up to 60 seconds before a sleep stage is plotted. This is due to the time it takes to calculate sleep stages. For live feedback, switch to a waveform view.
><br>

# T - Tracer
![DreamT Logo](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamT_HORZ_wp.png)
## System Requirements
* Windows 10/11 Operating System
* Bluetooth 4.0+
>[!NOTE]
>This project has been designed to run on a single, Windows-based PC.<br>
>Installation was experimented on MacOS and Linux. This feature is unofficial and may produce glitches and other unseen errors.<br>
>Using the install script, network access to this software is possible. This is unofficial and may produce glitches and other unseen errors.
><br>
## Installation

### For end users (recommended)

Download the latest `DreamRT Setup <version>.exe` from the project's Releases page, double-click it, and follow the install wizard. The installer will:

* Copy a self-contained copy of DreamRT into `Program Files` (or the folder you choose),
* Create a **DreamRT** shortcut on your desktop and in the Start Menu,
* Bundle everything the app needs - Python, Node, and the BLE communication service are all included inside the installer.

You **do not** need to install Python, Node.js, `pip`, `npm`, or anything else. Launching DreamRT from the desktop shortcut opens the app window directly; the backend runs silently in the background.

>[!NOTE]
>Because the installer is not code-signed, Windows SmartScreen may show a "Windows protected your PC" prompt the first time you run it. Click **More info > Run anyway** to continue.

### For developers: producing the installer from source

From a freshly-cloned repo on a Windows 10/11 machine with Python 3.10+ and Node.js 18+ on PATH:

```
.\build-installer.bat
```

The script will self-elevate (UAC prompt) because `electron-builder` needs admin to extract its signing toolchain, then it will:

1. `npm install` in `frontend/`,
2. freeze the Python backend to `dreamrt-backend.exe` via PyInstaller (so end users do not need Python),
3. build the Vite frontend,
4. package everything into a single NSIS `setup.exe` under `frontend/release-oneclick/`.

>[!TIP]
>An alternative source-install workflow is available via [dreamRT.bat](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/dreamRT.bat), which installs Python / Node / dependencies in-place and runs the app from source. Use this for active development; use `build-installer.bat` to produce a distributable.
><br>

In order to build from source, this project requires Python (and external libraries), and the React framework. This section covers the steps required to properly install this software from source code.
### Python
Python 3.14 is the recommended version of Python to install. This version can be installed by visiting the [Python website](https://www.python.org/) or by entering the following commands:
```
winget install 9NQ7512CXL7T --silent --accept-package-agreements --accept-source-agreements
```
This installs the Python library manager. You can then install Python 3.14 using the following:
```
py install 3.14 >> install_log.txt 2>&1
```
[Pip](https://pypi.org/project/pip/) is used to install additional libraries. Verify that pip is installed and using the latest version using:
```
py -m ensurepip --upgrade
py -m pip install --upgrade pip
```

Use pip to install the additional libaries:<br>
| Package | Use | Command |
| :--- | :--- | :---|
| PyCryptodome | Cryptographic Operations | `py -m pip install pycryptodome`|
| Flask | Frontend-Backend Communication | `py -m pip install Flask flask-cors` |
| NumPy | EEG Information Processing | `py -m pip install numpy` |
| Matplotlib | Visualizing | `py -m pip install matplotlib`|<br>
### React
>[!NOTE]
>Javascript must be installed on your device for this phase. You may be asked to restart your computer.
><br>

To install the [React](https://react.dev/) framework, we must install Node.js:
```
nvm install latest
```
To install the packages required to run the frontend, navigate to a folder titled "frontend" in your project directory. Then run the following calls:
```
call npm install --no-fund --no-audit
call npm install vite @vitejs/plugin-react --no-fund --no-audit
call npm install vite --save-dev --no-fund --no-audit
call npm audit fix
```
You may move back to the root software directory.
### Codebase
This codebase may be retrieved by pulling the [main repository](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/tree/main) into your project directory.<br/>
Congratulations! You have successfully installed the dependencies needed to run DreamRT.
## User Accounts
DreamRT accounts are used to securely access private EEG sessions, and control the visual experience while using the software. Integrity is preserved using a [Galois/Counter Mode](https://en.wikipedia.org/wiki/Galois/Counter_Mode) version of the [Advanced Encryption Standard](https://www.nist.gov/publications/advanced-encryption-standard-aes) (AES) cipher protocol with keys being derived using [Password-Based Key Derivation Function 2](https://en.wikipedia.org/wiki/PBKDF2).
### Account Creation
To create a new account, start the software and select `Create one`. This will create a popup window to create a new account. Enter a username, and a password with a minimum of six (6) characters. Reenter your password to confirm it, and click `Create Account` to create your account. You may then enter your username/password combo in the login screen to begin using your account!
>[!CAUTION]
>Remember your password. THERE IS NO PASSWORD RESET!!! If you cannot access your account, all sessions saved to that account will be lost. Passwords cannot be retrieved.
><br>
### User Settings
<img src="https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamRT_User_Settings.JPG" width="50%"></img><br>
Once logged in, you may modify your experience by navigating to the `⚙ Settings` button located in the top-right corner of your window. All settings you modify will affect only your account.<br><br>
The following settings are available to the user:
* `Theme` - Affects full window color scheme
* `Show Sleep Stages` - Toggles visibility of current sleep stage
* `Sleep Stage Colors` - Allows custom RGB values for Wake, Light, Deep, and REM sleep stages
* `Export Folder` - Gives user ability to change directory when exporting sessions
All settings may be reverted to default by selecting the `Reset to Defaults` button located at the bottom-right of the Sleep Session Settings window.
## Navigation
<img src="https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamRT_Visualizer_Window.jpg" width="75%"></img><br>
DreamRT is divided into numerous sections.
* `Top Bar` - Displays username, live/review switch, scan, settings, and logout button
  * `live/review switch` - Used to switch between Live Mode and Review Mode
  * `🔍 Scan` - Used to scan and connect to the DreamRT board
  * `⚙ Settings` - Used to access user settings
  * `Logout` - Logs user out of software, and returns to login screen
* `EEG & Hypnogram` - Visual window for EEG data
  * `Show EEG waveform` - Toggle between hypnogram and waveform
  * `Window` - Shows EEG data either as sleep stage (hypnogram) or amplitude (waveform)
  * `Window slider` - Enables user to navigate a session in 60 sample segments
* `Sleep summary` - Lists global data summary estimations for a given session (live or past)
  * `Recording duration` - Total length of session
  * `Sleep efficiency index` - Percentage of time spent asleep
  * `Est. sleep cycles` - Estimated number of sleep cycles captured during session
  * `Wake` - Known time user was awake
  * `N1/N2 (Light)` - Estimated time user spent in light sleep
  * `N3 Deep` - Estimated time user spent in deep sleep
  * `REM` - Known time user was in REM sleep
* `Sleep Status`(Live Only) - Provides brief technical summary of current session
  * `Samples` - Number of EEG channel samples collected this session (readings of your brainwaves)
  * `Duration` - Elapsed time since session start
  * `Clear Live Data` - Erases all data in current session
* `Acquisition status` - Gives live updates on device
  * `Data source` - Where data is coming from (usually BLE)
  * `Sampling rate` - How fast samples are being received (how many readings the device takes per second)
  * `Samples acquired` - How many samples have been acquired
  * `Recording duration` - Elapsed time of sample capture
  * `Save encrypted sleep session` - Saves current session in `sessions` folder
  * `Export CSV` - Exports current session as an unencrypted Comma-Separated Values (CSV) file in folder chosen by user
* `Sleep Sessions`(Review Only) - Lists sessions associated with account
  * `🔄 Refresh` - Sends request and populates with all visible sessions accessible by account
  * `YYYY-MM-DD` - Denotes session user can access
* `Loaded file details`(Review Only) - Global information regarding selected session
  * `File name` - Name of file holding session
  * `Device` - Name of device used to capture session
  * `Samples loaded` - Number of samples in session
  * `Recording duration` - Time session was being recorded
## Session Recording
To record a session, go to Live Mode and scan for a device. The session begins automatically once the device is connected and data is being received.<br><br>
Once you have finished your session, choose to save or export your session.
>[!IMPORTANT]
>`SAVE` - Encrypted EEG session. Only the account that saved the session can access can view it.<br>
>`EXPORT` - Unencrypted EEG session. Use when you want to move your session outside DreamRT.
><br>
## Session Review
To review a session, go to Review Sessions.<br>
The Sleep Sessions section should automatically populate with the sessions you have access to. Select a session to load it (this make take some time).<br>
A loaded session will remain loaded until a user is logged out.
## Debug Mode
>[!WARNING]
>Debug mode is not intended for commercial use. This is reserved for debugging purposes ONLY!<br>
>Compromising risks arise with debug mode enabled.
><br>

As part of its development, the Computer Science and Computer Engineering team developed a debug mode into the DreamRT software. To enable this debug feature, use the flag `--debug` on startup.<br>
Debug mode outputs messages inside the terminal. These messages can be used to help verify client-server communication, user interaction, device connection and pairing, as well as file management.<br>
# Contributions
## Computer Science and Computer Engineering
DreamR firmware and DreamT software was designed and developed by Team 17 of the Uark CSCE Capstone I&II class of 2025-2026. The following are the names and GitHub accounts of each member:<br>

| Name | GitHub Account |
| :--- | :--- |
| Joey Leder | [@JoeyLeder](https://github.com/JoeyLeder) |
| William Taylor | [@Will-Taylor08](https://github.com/Will-Taylor08) |
| Joseph Umuhoza | [@Sahunkuy](https://github.com/Sahunkuy) |
| Dylan Wilkins | [@DJW032](https://github.com/DJW032) |
| Charles Williams | [@Putter-64](https://github.com/Putter-64) |
| Caleb Young | [@cyetheguy](https://github.com/cyetheguy) |

To view the full graph of CSCE contribution, visit <a href="https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/graphs/contributors">here</a>.
## Electrical Engineering
The Electrical Engineering Capstone team was responsible for designing and developing the EEG board.
## Biomedical Engineering
The Biomedical Enginerring Capstone team served as scientific experts on electroencephalogram studies.

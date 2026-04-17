![DreamRT Logo](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamRT_HORZ_wp.png)

# DreamRT - Uark Electroencephalogram Capstone Project
**August 2025 - May 2026<br>
Collaboration between Computer Science Computer Engineering, Electrical Engineering, and Biomedical Engineering Capstone teams**
<br><br>
**Table of Contents:**<br>
&emsp;\* [Project Overview](#project-overview)<br>
&emsp;* [R - Reader](#dreamr)<br>
&emsp;&emsp;- [Device Setup](#device-setup)<br>
&emsp;&emsp;- [Device Activation](#device-activation)<br>
&emsp;\* [T - Tracer](#dreamt)<br>
&emsp;&emsp;- [Installation](#installation)<br>
&emsp;&emsp;- [User Configuration](#user-configuration)<br>
&emsp;&emsp;- [Navigation](#navigation)<br>
&emsp;&emsp;- [Session Recording](#session-recording)<br>
&emsp;&emsp;- [Session Review](#session-review)<br>
&emsp;\* [Contributions](#contributions)<br>


# Project Overview
Sleep monitoring via electroencephalograms (EEG) is critical for diagnosing and tracking neurological conditions and sleep health. However, traditional EEG systems are often cumbersome and uncomfortable for users due to lengthy setup procedures which involve multiple wired nodes and conductive gels. These elements make current EEG devices disruptive during usage, restricting their effectiveness in being an accessible, long-term method of sleep tracking for consumers. There have been commercial EEG-based sleep trackers; however, the market currently has no ergonomic, sub-$200 EEG for monitoring sleep health in a consumer's home.<br><br> 
To address this market gap, this project seeks to create a wireless EEG system designed for ease of use, comfort, and portability. The DreamR device will transmit brainwave reading data via Bluetooth Low Energy, enabling real-time monitoring without the constraints of traditional setups. The DreamT software is used to visualize and store the transmitted data privately for each user, allowing them to securely track their personal sleep patterns over time. This software solution aims to provide consumers with tools and resources to utilize this efficient EEG model. Both components provide greater data transparency and control for users, expanding its commercial market.<br>
# DreamR
![DreamR Logo](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamR_HORZ_wp.png)
The DreamRT board is an EEG board<br
## Device Setup
To begin
## Device Activation
Fill me<br>
# DreamT
![DreamT Logo](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/media/DreamT_HORZ_wp.png)
The DreamRT project is run locally on a Windows-based PC.
## Installation
>[!TIP]
><br>Installation can be achieved quickly by downloading and running this executable:
>```
>NEEDINSTALLERHERE
>```
><br>Alternatively, this program can be installed and immmediately run via a shell script. To utilize this feature, simply run [eeg_app.bat]((https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/blob/main/eeg_app.bat)) via running: 
>
>```
>.\eeg_app.bat --install
>```
><br>
In order for proper installation, this project requires Python (and external libraries), and the React framework. This section covers the steps required to properly install this software from the main GitHub repository.
>[!NOTE]
>All instructions are designed to run inside the Windows terminal. Installations on MacOS and Linux is not officially supported and may have various success.
><br>
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
PyCryptodome (cryptographic operations)&emsp;```py -m pip install pycryptodome```<br>
Flask (frontend-backend communication)&emsp;  ```py -m pip install Flask flask-cors```<br>
Numpy (EEG information processing)&emsp;&emsp;&emsp;```py -m pip install numpy```<br>
Matplotlib (Visualizing)&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;```py -m pip install matplotlib```<br>
### React
>[!NOTE]
>Javascript must be installed on your device for this phase. You may be asked to restart your computer.
><br>

To install the React framework, we must install Node.js:
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
This codebase may be retreived by pulling the [main repository](https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/tree/main) into your project directory.<br/>
Congradulations! You have successfully installed the dependencies needed to run DreamRT.
## User Configuration
Fill me<br>
## Navigation
Fill me<br>
## Session Recording
Fill me<br>
## Session Review
Fill me<br>
# Contributions
DreamR firmware and DreamT software was designed and developed by Team 17 of the Uark CSCE Capstone I&II class of 2025-2026. The following are the names and GitHub accounts of each member:<br>
<br>&emsp;&emsp;Joseph Umuhoza:&emsp;&nbsp;[@Sahunkuy](https://github.com/Sahunkuy)
<br>&emsp;&emsp;Caleb Young:&emsp;&emsp;&emsp;[&nbsp;@cyetheguy](https://github.com/cyetheguy)
<br>&emsp;&emsp;Charles Williams:&emsp;&ensp;[@Putter-64](https://github.com/Putter-64)
<br>&emsp;&emsp;Dylan Wilkins:&emsp;&emsp;&ensp;&ensp;[@DJW032](https://github.com/DJW032)
<br>&emsp;&emsp;William Taylor:&emsp;&emsp;&ensp;&ensp;[@Will-Taylor08](https://github.com/Will-Taylor08)
<br>&emsp;&emsp;Joey Leder:&emsp;&emsp;&ensp;&ensp;[@JoeyLeder](https://github.com/JoeyLeder)
<br><br>To view the full graph of CSCE contribution, visit <a href="https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone/graphs/contributors">here</a>.

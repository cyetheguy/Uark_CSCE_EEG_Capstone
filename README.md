# Uark_CSCE_EEG_Capstone


This is the README for every program that makes up the CSCE Team's contribution to the **Wireless EEG Device Project**<br>
This project was designed and developed by Team 17.<br>
The project was created during _CSCE 49603 Capstone II Spring 2026_ class.
<br><br>
Table of Contents:<br>
&emsp;* [Installation & Updating](#installation-and-updating)<br>
&emsp;* [How to Run](#how-to-run)<br>
&emsp;* [Contributors](#contributors)<br>

# Installation and Updating

## Installation

>[!TIP]
><br>This program can be installed and immmediately run via a shell script. To utilize this feature, first download [photon.sh](https://github.com/nhsmith4/Laser-Tag/blob/main/photon.sh) and execute the following commands within its directory: (You may have to edit photon.sh permissions by right clicking it, going to properties, then permissions, and click the checkmark to allow the file to run as a program)
>
>```
>chmod +x photon.sh
>./photon.sh --install
>```
><br><br>
>This should install all libraries and packages needed to run the software, as well as download the latest version of the software and immediately execute it.<br>
>*(Note): As this program is developed, new packages may be required. It is therefore recommended that whenever your program shows a library failure that you redownload the shell script and rerun with the installation flag.*

This software is intended to be run with *Python v3.9.2* within a Debian Linux Virtual Machine.<br>

## Updating

>[!TIP]
><br>It is recommended to update this program via a shell script. To utilize this feature, download/locate [photon.sh](https://github.com/nhsmith4/Laser-Tag/blob/main/photon.sh) and execute the following command within its directory: 
>
>```./photon.sh --update```
><br><br>
>This will pull download and execute the latest version of this software.

To update this software, pull down the [main branch](https://github.com/nhsmith4/Laser-Tag/tree/main) of this project.

## Required Installs
### Tkinter
The library *Tkinter* is the primary library used for graphics. If Tkinter is not installed natively on your machine, you can use the following command to install it.<br><br>
```sudo apt install python3-tk```
<br>
### Pygame
The *pygame* package is used for audio playback. This is the following command for installing pygame using *PIP*:<br><br>
```pip install pygame```<br>
### Pillow
The *PIL* library is used to render images. Ensure that Pillow is installed. This *PIP* command can install Pillow onto your machine:<br><br>
```pip install pillow```
### Psycopg2
The library used for communicating with the database is *psycopg2*. To install *psycopg* onto your device, enter the following commands:<br><br>
```
python3 -m venv path/to/venv
source path/to/venv/bin/activate
pip install psycopg2-binary
```

# How To Run
>[!TIP]
><br>This program can be run via a shell script. To utilize this feature, locate [photon.sh](https://github.com/nhsmith4/Laser-Tag/blob/main/photon.sh) and execute the following command within its directory:
>
>```./photon.sh <args>```
><br><br>
>All values inside of *\<args\>* will be passed into the program to run. This includes the arguments used for [debugging](https://github.com/nhsmith4/Laser-Tag/wiki/Debug-Mode).<br>
>*(Note): The shell script is intended to be run ***outside*** the *photon* directory. The script will not function properly inside of the directory.*

To run the program ***manually***, ensure your terminal is within the directory of the project. Once you have navigated to the correct directory, run the following command within your terminal:<br><br>
```python3 main.py```<br><br>
No arguments or other executables are required for this program to run correctly.<br>
The program is designed to be user-intuitive. However, a list of button functionality and keyboard shortcuts is provided by visiting our [game functionality and controls page](https://github.com/nhsmith4/Laser-Tag/wiki/Controls).

>[!NOTE]
><br>The program includes an additional debug mode for help with locating program errors. Debug mode can be activated by the following command:<br>
>
>```python3 main.py debug <flags>```
><br><br>
>A flag we commonly used was "controller" but without the quotes. The list of available arguments and their functionality can be found in the [debug wiki page](https://github.com/nhsmith4/Laser-Tag/wiki/Debug-Mode).

## Generating traffic to test functionality
In order to test the program by simulating a laser tag game, one must have Professor Strother's Traffic generator running in the background on a different terminal. This can be done by running the line:

>```python3 python_trafficgenarator_v2.py```

In a terminal. When prompted, make sure to enter the same equipment ID on the Player Entry Screen to sync up with the traffic generator.


# Contibutors
This project was designed and developed by Team 17. The following are the names and accounts of each member:<br>
<br>&emsp;&emsp;Joseph Umuhoza:&emsp;&nbsp;[@Sahunkuy](https://github.com/Sahunkuy)
<br>&emsp;&emsp;Caleb Young:&emsp;&emsp;&emsp;[&nbsp;@cyetheguy](https://github.com/cyetheguy)
<br>&emsp;&emsp;Charles Williams:&emsp;&ensp;[@Putter-64](https://github.com/Putter-64)
<br>&emsp;&emsp;Dylan Wilkins:&emsp;&emsp;&ensp;&ensp;[@DJW032](https://github.com/DJW032)

<br><br>(Edit) To see the full graph of contribution, visit <a href="https://github.com/nhsmith4/Laser-Tag/graphs/contributors">here</a>.

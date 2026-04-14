## Debug Flags
DEBUG =         2 ** 0
GUI =           2 ** 1


## Global Debug Flag
flag:int = 0


"""
Simple bitmask-based debug flags shared across backend modules.

Usage:
- `setDebug(DEBUG)` enables debug logging.
- `setDebug(DEBUG | GUI)` enables debug + GUI-specific behavior.

Design constraints:
- Flags are only ever OR-ed in (enabled). There is intentionally no "unset" at runtime so
  the backend can't accidentally disable logging midway through a run.
"""

## Debug Print func : OR Flags together for multiple flag requirements
def printDebug(msg:str, opCode=0) -> None:
    global flag
    if (getDebug(opCode)):
            print(msg)
    return

## Checks if debug flag is made
def getDebug(opCode:int = 0) -> bool:
    global flag
    return bool((flag & (DEBUG | opCode)) == (DEBUG | opCode))


## Sets a Debug Flag --- CANNOT BE REMOVED WITHOUT RESTART
def setDebug(opCode:int) -> None:
    global flag
    flag |= opCode
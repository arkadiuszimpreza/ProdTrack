import React, { createContext, useContext, useEffect, useState } from 'react';

export type TerminalProfile = 'auto' | 'always' | 'never';

interface DeviceEnvironmentContextType {
  customKeyboardEnabled: boolean;
  terminalProfile: TerminalProfile;
  setTerminalProfile: (profile: TerminalProfile) => void;
  overrideKeyboard: (show: boolean | null) => void;
  manualOverride: boolean | null;
}

const DeviceEnvironmentContext = createContext<DeviceEnvironmentContextType | undefined>(undefined);

export function DeviceEnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [terminalProfile, setTerminalProfile] = useState<TerminalProfile>(() => {
    return (localStorage.getItem('terminal_profile') as TerminalProfile) || 'auto';
  });

  const [hasTouch, setHasTouch] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [physicalKeyboardUsed, setPhysicalKeyboardUsed] = useState(false);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  useEffect(() => {
    localStorage.setItem('terminal_profile', terminalProfile);
  }, [terminalProfile]);

  useEffect(() => {
    // Layer 1: Mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                     || (navigator as any).userAgentData?.mobile;
    setIsMobileDevice(isMobile);

    // Layer 2: Touch detection
    const hasTouchPoints = navigator.maxTouchPoints > 0;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    setHasTouch(hasTouchPoints || isCoarse);

    // Layer 3: Physical keyboard heuristic
    const handleKeyDown = (e: KeyboardEvent) => {
      // If we are typing on a physical keyboard, disable virtual keyboard
      // Ignore modifier keys
      if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        setPhysicalKeyboardUsed(true);
        // Also clear manual override if they start using physical keyboard
        if (manualOverride === true) {
            setManualOverride(null);
        }
      }
    };

    const handleTouchStart = () => {
      // If touched, maybe the user wants to use the virtual keyboard again
      setPhysicalKeyboardUsed(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('touchstart', handleTouchStart, { capture: true });
    };
  }, [manualOverride]);

  const overrideKeyboard = (show: boolean | null) => {
    setManualOverride(show);
  };

  let customKeyboardEnabled = false;

  if (manualOverride !== null) {
    customKeyboardEnabled = manualOverride;
  } else if (terminalProfile === 'always') {
    customKeyboardEnabled = true;
  } else if (terminalProfile === 'never') {
    customKeyboardEnabled = false;
  } else {
    // Auto profile
    if (isMobileDevice) {
      customKeyboardEnabled = false; // native keyboard
    } else if (hasTouch && !physicalKeyboardUsed) {
      customKeyboardEnabled = true;
    } else {
      customKeyboardEnabled = false;
    }
  }

  return (
    <DeviceEnvironmentContext.Provider value={{
      customKeyboardEnabled,
      terminalProfile,
      setTerminalProfile,
      overrideKeyboard,
      manualOverride
    }}>
      {children}
    </DeviceEnvironmentContext.Provider>
  );
}

export const useDeviceEnvironment = () => {
  const context = useContext(DeviceEnvironmentContext);
  if (!context) throw new Error('useDeviceEnvironment must be used within DeviceEnvironmentProvider');
  return context;
};

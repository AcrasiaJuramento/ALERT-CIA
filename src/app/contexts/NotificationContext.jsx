import { createContext, useContext, useState, useEffect } from 'react';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      type: 'pcr_submitted',
      title: 'New PCR Report Submitted',
      message: 'Cpl. Roberto Aquino submitted PCR-2026-001 for verification',
      timestamp: new Date().toISOString(),
      read: false,
    },
    {
      id: 'notif-2',
      type: 'pcr_verified',
      title: 'PCR Report Verified',
      message: 'Your PCR-2026-003 has been verified by Dispatcher Juan dela Cruz',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      read: false,
    },
  ]);

  const addNotification = (notification) => {
    const newNotification = {
      ...notification,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [newNotification, ...prev]);
  };

  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, markAsRead, clearAll, unreadCount }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

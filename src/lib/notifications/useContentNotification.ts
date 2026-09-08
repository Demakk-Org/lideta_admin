'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export type ContentNotificationType =
  | 'audio'
  | 'news'
  | 'event'
  | 'course'
  | 'daily_verse';

export type ContentNotificationInput = {
  type: ContentNotificationType;
  id: string;
  title: string;
  /** Detail line for the notification body; courses send their description. */
  body?: string;
  imageUrl?: string;
};

/**
 * Broadcasts a "new content" notification to every user, mirroring the videos
 * page. Returns a `notifying` flag so lists can disable the bell while a
 * broadcast is in flight.
 */
export function useContentNotification() {
  const [notifying, setNotifying] = useState(false);

  const notify = useCallback(async (input: ContentNotificationInput) => {
    try {
      setNotifying(true);
      const response = await fetch('/api/content-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to send notification');
      }

      const devices =
        result.pushNotifications > 0
          ? ` and ${result.pushNotifications} devices`
          : '';
      toast.success(
        result.scope === 'global'
          ? `Notification posted for all members${devices}`
          : `Notification sent to ${result.inAppNotifications} users${devices}`,
      );
    } catch (error) {
      console.error('[useContentNotification] Failed to send notification', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send notification',
      );
    } finally {
      setNotifying(false);
    }
  }, []);

  return { notifying, notify };
}

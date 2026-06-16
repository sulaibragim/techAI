import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bell, BellOff, Send, Check, AlertTriangle, Smartphone } from 'lucide-react';
import {
  pushSupported,
  pushPermission,
  isSubscribed,
  isIOS,
  isStandalone,
  enablePush,
  disablePush,
  sendTestPush,
} from '../pushClient';

export const PushNotificationsCard: React.FC = () => {
  const [supported] = useState(pushSupported());
  const [permission, setPermission] = useState(pushPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const iosNeedsInstall = isIOS() && !isStandalone();

  useEffect(() => {
    isSubscribed().then(setSubscribed);
  }, []);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    const res = await enablePush();
    if (res.ok) {
      setSubscribed(true);
      setPermission('granted');
      setMsg({ kind: 'ok', text: 'Notifications are on for this device.' });
      setBusy(false);
      return;
    }
    const reasons: Record<string, string> = {
      denied: 'Blocked. Allow notifications for TrustKey in your phone settings, then try again.',
      default: 'Permission was dismissed. Tap again and choose Allow.',
      unsupported: 'This browser does not support notifications.',
      'server-disabled': 'Server keys not configured yet. The owner needs to finish setup.',
      'subscribe-failed': 'Could not subscribe. Open the app from the Home Screen icon and retry.',
      'save-failed': 'Could not reach the server. Check your connection and retry.',
    };
    setMsg({ kind: 'err', text: (res.reason && reasons[res.reason]) || 'Could not enable notifications.' });
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    setMsg(null);
    await disablePush();
    setSubscribed(false);
    setMsg({ kind: 'ok', text: 'Notifications turned off for this device.' });
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    const ok = await sendTestPush();
    setMsg(
      ok
        ? { kind: 'ok', text: 'Test sent — it should pop up in a moment.' }
        : { kind: 'err', text: 'Could not send the test. Server push may not be configured yet.' }
    );
    setBusy(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-white/5 rounded-2xl p-6"
    >
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
          <Bell size={16} className="text-blue-400" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-white">Notifications</h3>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-gray-400 leading-relaxed">
          Get a phone notification the moment a job is assigned to you or a client replies — even
          when the app is closed.
        </p>

        {!supported && (
          <div className="flex items-start gap-2 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <Smartphone size={14} className="shrink-0 mt-0.5" />
            <span>Open the app from its Home Screen icon to turn on notifications.</span>
          </div>
        )}

        {supported && iosNeedsInstall && (
          <div className="flex items-start gap-2 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <Smartphone size={14} className="shrink-0 mt-0.5" />
            <span>On iPhone, first add the app to your Home Screen, then open it from that icon — only then can notifications be enabled.</span>
          </div>
        )}

        {supported && !iosNeedsInstall && (
          <div className="flex flex-wrap items-center gap-2">
            {subscribed ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <Check size={14} /> Notifications on
                </span>
                <button
                  onClick={test}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                >
                  <Send size={14} /> Send test
                </button>
                <button
                  onClick={disable}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                >
                  <BellOff size={14} /> Turn off
                </button>
              </>
            ) : (
              <button
                onClick={enable}
                disabled={busy}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50"
              >
                <Bell size={16} /> {busy ? 'Enabling…' : 'Enable notifications'}
              </button>
            )}
          </div>
        )}

        {msg && (
          <div
            className={`flex items-start gap-2 text-xs rounded-xl p-3 ${
              msg.kind === 'ok'
                ? 'text-green-400/90 bg-green-500/10 border border-green-500/20'
                : 'text-red-400/90 bg-red-500/10 border border-red-500/20'
            }`}
          >
            {msg.kind === 'ok' ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
            <span>{msg.text}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

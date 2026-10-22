import { useApp } from '@ui/store/AppContext';

export function Toast() {
  const { state } = useApp();
  return (
    <div className="toast-wrap">
      {state.toasts.map(t => (
        <div key={t.id} className={'toast' + (t.kind ? ' ' + t.kind : '')}>{t.msg}</div>
      ))}
    </div>
  );
}

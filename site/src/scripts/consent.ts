import { getConsent, pixelsConfigured, setConsent } from './pixels';

const banner = document.querySelector<HTMLElement>('[data-consent]');
if (banner && pixelsConfigured) {
  const show = () => {
    banner.hidden = false;
  };
  if (!getConsent()) show();
  banner.querySelectorAll<HTMLButtonElement>('[data-consent-choice]').forEach((b) =>
    b.addEventListener('click', () => {
      setConsent(b.dataset.consentChoice === 'granted' ? 'granted' : 'denied');
      banner.hidden = true;
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-consent-open]').forEach((b) => {
    b.hidden = false;
    b.addEventListener('click', () => {
      show();
      banner.querySelector<HTMLButtonElement>('[data-consent-choice]')?.focus();
    });
  });
}

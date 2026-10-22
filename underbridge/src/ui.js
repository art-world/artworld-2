// On-screen controls. Two arrows, an index, a title. Nothing else.

export function createUI({ count, onPrev, onNext, onToggle, onSeek }){
  const root = document.getElementById('ui');

  const prev = root.querySelector('.arrow.prev');
  const next = root.querySelector('.arrow.next');
  const index = root.querySelector('.index');
  const title = root.querySelector('.title');
  const hint = root.querySelector('.hint');
  const playbar = root.querySelector('.playbar');
  const played = playbar.querySelector('i');

  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);

  // Seek from anywhere along the bar, including the padded area above it.
  playbar.addEventListener('pointerdown', (e) => {
    const box = playbar.getBoundingClientRect();
    const at = (e.clientX - box.left) / Math.max(box.width, 1);
    if (onSeek) onSeek(Math.max(0, Math.min(1, at)));
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); onPrev(); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); onNext(); }
    else if (e.key === ' '){ e.preventDefault(); onToggle(); }
  });

  const pad = (n) => String(n).padStart(2, '0');

  return {
    setTrack(i, track){
      index.textContent = `${pad(i + 1)} / ${pad(count)}`;
      title.textContent = track.title;
    },
    setHint(text){
      hint.textContent = text || '';
      hint.style.opacity = text ? '1' : '0';
    },
    setPlayed(fraction){
      played.style.width = (Math.max(0, Math.min(1, fraction)) * 100).toFixed(2) + '%';
    },
    reveal(){
      root.classList.add('ready');
    },
  };
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CroppedPrint } from './components/CroppedPrint';
import {
  ACCORDION_ITEMS,
  CURRENCIES,
  CurrencyCode,
  formatMoney,
  FRAME_OPTIONS,
  FrameOption,
  getDomCropStyle,
  PAPER_OPTIONS,
  PaperOption,
  PRINTS,
  SIGNATURE_OPTIONS,
  SignatureOption,
  SIZE_OPTIONS,
  SizeOption,
} from './data/prints';
import { GalleryScene, ScreenRect, SMALL_MQ } from './gallery/GalleryScene';

type ViewMode = 'gallery' | 'list' | 'page';
type UtilityModal = null | 'search' | 'info' | 'auctions' | 'help' | 'account' | 'saved';

interface BagItem {
  id: string;
  printIdx: number;
  paper: PaperOption;
  size: SizeOption;
  signature: SignatureOption;
  frame: FrameOption;
  qty: number;
}

function isReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function App() {
  const galleryMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GalleryScene | null>(null);
  const pageScrollRef = useRef<HTMLElement | null>(null);
  const pagePrintRef = useRef<HTMLDivElement | null>(null);
  const detailsTimerRef = useRef<number>(0);
  const bagAnimTimerRef = useRef<number>(0);
  const flyerElRef = useRef<HTMLDivElement | null>(null);
  const flyerAnimRef = useRef<Animation | null>(null);

  const [entered, setEntered] = useState(false);
  const [view, setView] = useState<ViewMode>('gallery');
  const [focusedSlot, setFocusedSlot] = useState<{
    printIdx: number;
    wall: 'outer' | 'inner';
    angle: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverState, setHoverState] = useState({
    overAny: false,
    overFocused: false,
    x: 0,
    y: 0,
  });
  const [smallPill, setSmallPill] = useState({ visible: false, x: 0, y: 0 });
  const [isSmall, setIsSmall] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(SMALL_MQ).matches : false,
  );

  // Print page state
  const [selectedPrintIdx, setSelectedPrintIdx] = useState(0);
  const [lastPrintIdx, setLastPrintIdx] = useState(0);
  const [flyerActive, setFlyerActive] = useState(false);
  const [detailsShown, setDetailsShown] = useState(false);

  const [paper, setPaper] = useState<PaperOption>('Art Paper');
  const [size, setSize] = useState<SizeOption>('11.7 × 16.5" (A3)');
  const [signature, setSignature] = useState<SignatureOption>('Unsigned');
  const [frame, setFrame] = useState<FrameOption>('Unframed');
  const [qty, setQty] = useState(1);
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({});

  // Shop / Utility state
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [bag, setBag] = useState<BagItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enteringItemId, setEnteringItemId] = useState<string | null>(null);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [savedPrints, setSavedPrints] = useState<number[]>([]);
  const [utilityModal, setUtilityModal] = useState<UtilityModal>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const viewRef = useRef<ViewMode>(view);
  viewRef.current = view;
  const drawerOpenRef = useRef<boolean>(drawerOpen);
  drawerOpenRef.current = drawerOpen;
  const utilityModalRef = useRef<UtilityModal>(utilityModal);
  utilityModalRef.current = utilityModal;

  useEffect(() => {
    const mq = window.matchMedia(SMALL_MQ);
    const update = () => setIsSmall(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const clearFlyer = useCallback(() => {
    if (flyerAnimRef.current) {
      flyerAnimRef.current.cancel();
      flyerAnimRef.current = null;
    }
    if (flyerElRef.current && flyerElRef.current.parentNode) {
      flyerElRef.current.parentNode.removeChild(flyerElRef.current);
      flyerElRef.current = null;
    }
  }, []);

  const openPrintPage = useCallback(
    (printIdx: number, srcRect: ScreenRect | null, scrollSmooth = false) => {
      window.clearTimeout(detailsTimerRef.current);
      clearFlyer();

      setSelectedPrintIdx(printIdx);
      setLastPrintIdx(printIdx);
      setQty(1);
      setView('page');

      const reduced = isReducedMotion();
      setDetailsShown(reduced);
      setFlyerActive(Boolean(srcRect) && !reduced);

      const pageEl = pageScrollRef.current;
      if (pageEl) {
        pageEl.scrollTo({
          top: 0,
          behavior: scrollSmooth && !reduced && !isSmall ? 'smooth' : 'auto',
        });
      }

      if (srcRect && !reduced) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const dstEl = pagePrintRef.current;
            if (!dstEl) {
              setFlyerActive(false);
              return;
            }
            const dstRect = dstEl.getBoundingClientRect();
            if (dstRect.width <= 0 || dstRect.height <= 0) {
              setFlyerActive(false);
              return;
            }

            const flyer = document.createElement('div');
            flyer.className = 'flyer';
            flyer.style.left = `${dstRect.left}px`;
            flyer.style.top = `${dstRect.top}px`;
            flyer.style.width = `${dstRect.width}px`;
            flyer.style.height = `${dstRect.height}px`;
            const cropCss = getDomCropStyle(PRINTS[printIdx].crop, dstRect.width, dstRect.height);
            flyer.style.backgroundImage = cropCss.backgroundImage;
            flyer.style.backgroundRepeat = cropCss.backgroundRepeat;
            flyer.style.backgroundSize = cropCss.backgroundSize;
            flyer.style.backgroundPosition = cropCss.backgroundPosition;
            document.body.appendChild(flyer);
            flyerElRef.current = flyer;

            const dx = srcRect.left - dstRect.left;
            const dy = srcRect.top - dstRect.top;
            const sx = srcRect.width / dstRect.width;
            const sy = srcRect.height / dstRect.height;

            const anim = flyer.animate(
              [
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                { transform: 'translate(0px, 0px) scale(1, 1)' },
              ],
              {
                duration: 300,
                easing: 'cubic-bezier(0.25, 0.75, 0.25, 1)',
                fill: 'forwards',
              },
            );
            flyerAnimRef.current = anim;
            anim.onfinish = () => {
              clearFlyer();
              setFlyerActive(false);
            };
          });
        });
      } else {
        setFlyerActive(false);
      }

      if (!reduced) {
        detailsTimerRef.current = window.setTimeout(() => {
          setDetailsShown(true);
        }, 1000);
      }
    },
    [clearFlyer, isSmall],
  );

  const openPrintRef = useRef(openPrintPage);
  openPrintRef.current = openPrintPage;

  // Mount Three.js GalleryScene once
  useEffect(() => {
    const mount = galleryMountRef.current;
    if (!mount) return;

    const scene = new GalleryScene(mount, {
      onEntranceStart: () => setEntered(true),
      onFocusChange: (slot) => {
        setFocusedSlot(slot);
        if (slot) {
          setLastPrintIdx(slot.printIdx);
        }
      },
      onOpenPrint: (printIdx, rect) => {
        openPrintRef.current(printIdx, rect, false);
      },
      onHoverState: (info) => setHoverState(info),
      onSmallScreenPill: (pill) => setSmallPill(pill),
      onDragChange: (d) => setDragging(d),
    });

    sceneRef.current = scene;

    return () => {
      window.clearTimeout(detailsTimerRef.current);
      window.clearTimeout(bagAnimTimerRef.current);
      clearFlyer();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [clearFlyer]);

  // Pause 3D interaction when page, list, drawer, or modal is open
  useEffect(() => {
    const paused = view !== 'gallery' || drawerOpen || utilityModal !== null;
    sceneRef.current?.setPaused(paused);
  }, [view, drawerOpen, utilityModal]);

  const returnToGallery = useCallback(
    (focusLast = true) => {
      window.clearTimeout(detailsTimerRef.current);
      clearFlyer();
      setFlyerActive(false);

      const wasOverlay = viewRef.current !== 'gallery';
      setView('gallery');

      if (wasOverlay && focusLast) {
        sceneRef.current?.focusNearestOuterPrint(lastPrintIdx);
      } else if (!wasOverlay && focusedSlot) {
        sceneRef.current?.stepBack();
      }
    },
    [clearFlyer, focusedSlot, lastPrintIdx],
  );

  const openListView = useCallback(() => {
    window.clearTimeout(detailsTimerRef.current);
    clearFlyer();
    setFlyerActive(false);
    setView('list');
  }, [clearFlyer]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setUtilityModal((prev) => (prev === 'search' ? null : 'search'));
        return;
      }

      if (e.key === 'Escape') {
        if (utilityModalRef.current !== null) {
          setUtilityModal(null);
          return;
        }
        if (drawerOpenRef.current) {
          setDrawerOpen(false);
          return;
        }
        if (viewRef.current !== 'gallery') {
          returnToGallery(true);
          return;
        }
        sceneRef.current?.stepBack();
        return;
      }

      if (viewRef.current === 'gallery' && !drawerOpenRef.current && utilityModalRef.current === null) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          sceneRef.current?.stepArrow(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          sceneRef.current?.stepArrow(-1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [returnToGallery]);

  const handleAddToBag = useCallback(() => {
    window.clearTimeout(bagAnimTimerRef.current);
    setCheckoutDone(false);

    const itemId = `${selectedPrintIdx}|${paper}|${size}|${signature}|${frame}`;
    setBag((prev) => {
      const existing = prev.find((it) => it.id === itemId);
      if (existing) {
        return prev.map((it) => (it.id === itemId ? { ...it, qty: it.qty + qty } : it));
      }
      return [
        ...prev,
        {
          id: itemId,
          printIdx: selectedPrintIdx,
          paper,
          size,
          signature,
          frame,
          qty,
        },
      ];
    });

    setDrawerOpen(true);

    if (isReducedMotion()) {
      setEnteringItemId(null);
    } else {
      setEnteringItemId(itemId);
      bagAnimTimerRef.current = window.setTimeout(() => {
        setEnteringItemId(null);
      }, 750);
    }
  }, [frame, paper, qty, selectedPrintIdx, signature, size]);

  const updateBagQty = useCallback((id: string, delta: number) => {
    setBag((prev) =>
      prev
        .map((it) => (it.id === id ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0),
    );
  }, []);

  const removeBagItem = useCallback((id: string) => {
    setBag((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const toggleBookmark = useCallback((printIdx: number) => {
    setSavedPrints((prev) =>
      prev.includes(printIdx) ? prev.filter((i) => i !== printIdx) : [...prev, printIdx],
    );
  }, []);

  const cycleCurrency = useCallback(() => {
    const keys = Object.keys(CURRENCIES) as CurrencyCode[];
    setCurrency((prev) => keys[(keys.indexOf(prev) + 1) % keys.length]);
  }, []);

  const totalBagCount = useMemo(() => bag.reduce((sum, it) => sum + it.qty, 0), [bag]);
  const bagSubtotalUsd = useMemo(
    () => bag.reduce((sum, it) => sum + PRINTS[it.printIdx].price * it.qty, 0),
    [bag],
  );

  const selectedPrint = PRINTS[selectedPrintIdx];

  const collectionPrints = useMemo(
    () => [0, 1, 2, 3].map((offset) => PRINTS[(selectedPrintIdx + offset) % PRINTS.length]),
    [selectedPrintIdx],
  );

  const filteredSearchPrints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return PRINTS;
    return PRINTS.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.artist.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const navSolid = view === 'page' || view === 'list';

  const pillVisible =
    view === 'gallery' &&
    !drawerOpen &&
    utilityModal === null &&
    focusedSlot !== null &&
    (isSmall ? smallPill.visible : hoverState.overFocused);

  const pillX = isSmall ? smallPill.x : hoverState.x;
  const pillY = isSmall ? smallPill.y : hoverState.y;

  const isSaved = savedPrints.includes(selectedPrintIdx);

  return (
    <>
      {/* 1. Nav */}
      <header className={`nav${navSolid ? ' solid' : ''}${entered ? ' entered' : ''}`}>
        <button
          type="button"
          className="nav-logo nav-anim"
          style={{ '--i': 5 } as React.CSSProperties}
          onClick={() => returnToGallery(true)}
        >
          Zestwell
        </button>

        <nav className="nav-links" aria-label="Main navigation">
          <button
            type="button"
            className={`nav-link nav-anim${view === 'gallery' ? ' active' : ''}`}
            style={{ '--i': 6 } as React.CSSProperties}
            onClick={() => returnToGallery(true)}
          >
            Index
          </button>
          <button
            type="button"
            className={`nav-link nav-anim${view === 'list' ? ' active' : ''}`}
            style={{ '--i': 7 } as React.CSSProperties}
            onClick={openListView}
          >
            Shop
          </button>
          <button
            type="button"
            className="nav-link nav-anim"
            style={{ '--i': 8 } as React.CSSProperties}
            onClick={() => setUtilityModal('info')}
          >
            Info
          </button>
          <button
            type="button"
            className="nav-link nav-anim"
            style={{ '--i': 9 } as React.CSSProperties}
            onClick={() => setUtilityModal('auctions')}
          >
            Auctions
          </button>
          <button
            type="button"
            className="nav-link nav-anim"
            style={{ '--i': 10 } as React.CSSProperties}
            onClick={() => setUtilityModal('help')}
          >
            Help
          </button>
        </nav>

        <div className="nav-right">
          <button
            type="button"
            className="nav-search nav-anim"
            style={{ '--i': 11 } as React.CSSProperties}
            onClick={() => setUtilityModal('search')}
            aria-label="Search prints"
          >
            <svg className="nav-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>Search…</span>
            <kbd className="nav-kbd">⌘K</kbd>
          </button>

          <button
            type="button"
            className="nav-currency nav-anim"
            style={{ '--i': 12 } as React.CSSProperties}
            onClick={cycleCurrency}
            aria-label={`Currency ${currency}, click to switch`}
          >
            <span>{currency}</span>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="M2 3.5 5 6.5 8 3.5" />
            </svg>
          </button>

          <button
            type="button"
            className="nav-icon-btn nav-account nav-anim"
            style={{ '--i': 13 } as React.CSSProperties}
            onClick={() => setUtilityModal('account')}
            aria-label="Account"
          >
            <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
            </svg>
          </button>

          <button
            type="button"
            className="nav-icon-btn nav-heart nav-anim"
            style={{ '--i': 14 } as React.CSSProperties}
            onClick={() => setUtilityModal('saved')}
            aria-label="Saved prints"
          >
            <svg
              className="nav-icon-svg"
              viewBox="0 0 24 24"
              fill={savedPrints.length > 0 ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20.5s-7.5-4.7-9.2-9.2C1.6 8 3.7 5 6.8 5c1.9 0 3.7 1 5.2 2.8C13.5 6 15.3 5 17.2 5c3.1 0 5.2 3 4 6.3-1.7 4.5-9.2 9.2-9.2 9.2Z" />
            </svg>
          </button>

          <button
            type="button"
            className="nav-icon-btn nav-bag nav-anim"
            style={{ '--i': 15 } as React.CSSProperties}
            onClick={() => setDrawerOpen(true)}
            aria-label={`Shopping bag, ${totalBagCount} items`}
          >
            <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 7h12l1 13H5L6 7Z" />
              <path d="M9 7V6a3 3 0 0 1 6 0v1" />
            </svg>
            {totalBagCount > 0 && <span className="bag-badge">{totalBagCount}</span>}
          </button>
        </div>
      </header>

      {/* 2. Gallery (3D WebGL Canvas + Veil) */}
      <main
        id="gallery"
        ref={galleryMountRef}
        className={`${dragging ? 'dragging' : ''}${!dragging && hoverState.overAny ? ' over-print' : ''}`}
        aria-label="3D Citrus Season gallery passage"
      >
        <div id="veil" className={entered ? 'gone' : ''} />
      </main>

      {/* 3. Gallery UI */}
      <div className={`gui${view !== 'gallery' ? ' hidden' : ''}${entered ? ' entered' : ''}`}>
        <div className="gui-arrows">
          <button
            type="button"
            className="arrow-btn"
            aria-label="Previous print"
            onClick={() => sceneRef.current?.stepArrow(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="m11 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="arrow-btn"
            aria-label="Next print"
            onClick={() => sceneRef.current?.stepArrow(1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="gui-hint">
          <span className="mask-line">
            <span className="mask-inner" style={{ '--i': 0 } as React.CSSProperties}>
              {focusedSlot ? 'Click the painting to open it' : 'Scroll or drag to walk round'}
            </span>
          </span>
          <span className="mask-line">
            <span className="mask-inner" style={{ '--i': 1 } as React.CSSProperties}>
              {focusedSlot ? 'Esc or click away to step back' : 'Click a painting to look closer'}
            </span>
          </span>
        </div>

        <div className="gui-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`toggle-btn${view === 'gallery' ? ' active' : ''}`}
            onClick={() => returnToGallery(true)}
          >
            GALLERY
          </button>
          <button
            type="button"
            className={`toggle-btn${view === 'list' ? ' active' : ''}`}
            onClick={openListView}
          >
            LIST
          </button>
        </div>

        <div className="gui-caption">
          <p className="gui-kicker">
            <span className="mask-line">
              <span className="mask-inner" style={{ '--i': 2 } as React.CSSProperties}>
                YOU ARE WALKING PAST
              </span>
            </span>
          </p>
          <div className="gui-headline-row">
            <h1 className="gui-headline">
              <span className="mask-line headline-mask">
                <span className="mask-inner" style={{ '--i': 3 } as React.CSSProperties}>
                  CITRUS
                  <br className="small-portrait-br" /> SEASON
                </span>
              </span>
            </h1>
            <button type="button" className="gui-link" onClick={openListView}>
              <span className="mask-line">
                <span className="mask-inner" style={{ '--i': 4 } as React.CSSProperties}>
                  ENTER THE COLLECTION →
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Pill */}
      <div
        className={`open-pill${pillVisible ? ' visible' : ''}`}
        style={{ left: `${pillX}px`, top: `${pillY}px` }}
        aria-hidden="true"
      >
        OPEN THE PRINT
      </div>

      {/* 5. Print Product Page */}
      <section
        id="page"
        ref={pageScrollRef}
        className={view === 'page' ? 'open' : ''}
        aria-hidden={view !== 'page'}
        aria-label={selectedPrint.title}
      >
        <div className="page-grid">
          <div className="page-left">
            <div ref={pagePrintRef} className={`page-print-box${flyerActive ? ' flying-hidden' : ''}`}>
              <CroppedPrint
                printIndex={selectedPrintIdx}
                className="w-full h-full"
                ariaLabel={`${selectedPrint.title} by ${selectedPrint.artist}`}
              />
            </div>

            <div className={`page-meta details-fade${detailsShown ? ' shown' : ''}`}>
              <span>1/1</span>
              <button
                type="button"
                className="page-meta-room"
                onClick={() => returnToGallery(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
                  <path d="M12 12 20 7.5" />
                  <path d="M12 12v9" />
                  <path d="M12 12 4 7.5" />
                </svg>
                <span>View in room</span>
              </button>
              <button
                type="button"
                className="page-meta-bookmark"
                onClick={() => toggleBookmark(selectedPrintIdx)}
                aria-label={isSaved ? 'Remove bookmark' : 'Bookmark print'}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill={isSaved ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 4h12v17l-6-4-6 4V4Z" />
                </svg>
              </button>
            </div>
          </div>

          <div className={`page-right details-fade${detailsShown ? ' shown' : ''}`}>
            <h2 className="page-title">{selectedPrint.title}</h2>
            <p className="page-artist">{selectedPrint.artist}</p>
            <p className="page-desc">{selectedPrint.description}</p>
            <p className="page-price">{formatMoney(selectedPrint.price, currency, true)}</p>
            <p className="page-tax">Prices include VAT. Shipping calculated at checkout.</p>

            <div className="page-options">
              <div>
                <div className="option-label">
                  Paper <span>{paper}</span>
                </div>
                <div className="chips-row">
                  {PAPER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`chip${paper === opt ? ' selected' : ''}`}
                      onClick={() => setPaper(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="option-label">
                  Size <span>{size}</span>
                </div>
                <div className="chips-row">
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`chip${size === opt ? ' selected' : ''}`}
                      onClick={() => setSize(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="option-label">
                  Signature <span>{signature}</span>
                </div>
                <div className="chips-row">
                  {SIGNATURE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`chip${signature === opt ? ' selected' : ''}`}
                      onClick={() => setSignature(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="option-label">
                  Frame <span>{frame}</span>
                </div>
                <div className="chips-row">
                  {FRAME_OPTIONS.map((opt) => {
                    const thumbMod =
                      opt === 'Classic Frame' ? ' classic' : opt === 'Framed Canvas' ? ' canvas' : '';
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={`frame-chip${frame === opt ? ' selected' : ''}`}
                        onClick={() => setFrame(opt)}
                      >
                        <CroppedPrint
                          printIndex={selectedPrintIdx}
                          className={`frame-thumb${thumbMod}`}
                          ariaLabel={opt}
                        />
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="buy-row">
              <div className="qty-box" aria-label="Quantity">
                <button
                  type="button"
                  className="qty-btn"
                  aria-label="Decrease quantity"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span>{qty}</span>
                <button
                  type="button"
                  className="qty-btn"
                  aria-label="Increase quantity"
                  onClick={() => setQty((q) => Math.min(9, q + 1))}
                >
                  +
                </button>
              </div>
              <button type="button" className="add-btn" onClick={handleAddToBag}>
                ADD TO BAG
              </button>
            </div>

            <div className="accordion">
              {ACCORDION_ITEMS.map((item, idx) => {
                const isOpen = Boolean(openAccordions[idx]);
                return (
                  <div key={item.title} className={`acc-item${isOpen ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="acc-trigger"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpenAccordions((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                    >
                      <span>{item.title}</span>
                      <span className="acc-plus" aria-hidden="true">
                        +
                      </span>
                    </button>
                    <div className="acc-panel">
                      <div className="acc-panel-inner">
                        <p className="acc-body">{item.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`collection-band details-fade${detailsShown ? ' shown' : ''}`}>
          <h3 className="collection-heading">GET THE COLLECTION</h3>
          <div className="collection-row">
            {collectionPrints.map((item) => (
              <button
                key={item.index}
                type="button"
                className="print-card"
                onClick={(e) => {
                  const imgEl = e.currentTarget.querySelector('.print-card-img');
                  const rect = imgEl ? imgEl.getBoundingClientRect() : null;
                  openPrintPage(
                    item.index,
                    rect
                      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                      : null,
                    true,
                  );
                }}
              >
                <CroppedPrint printIndex={item.index} className="print-card-img" />
                <span className="print-card-title">{item.title}</span>
                <span className="print-card-artist">{item.artist}</span>
                <span className="print-card-price">{formatMoney(item.price, currency)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 6. List View */}
      <section id="list" className={view === 'list' ? 'open' : ''} aria-hidden={view !== 'list'}>
        <h2 className="list-heading">CITRUS SEASON — ALL PRINTS</h2>
        <div className="list-grid">
          {PRINTS.map((item) => (
            <button
              key={item.index}
              type="button"
              className="print-card"
              onClick={(e) => {
                const imgEl = e.currentTarget.querySelector('.print-card-img');
                const rect = imgEl ? imgEl.getBoundingClientRect() : null;
                openPrintPage(
                  item.index,
                  rect
                    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                    : null,
                  false,
                );
              }}
            >
              <CroppedPrint printIndex={item.index} className="print-card-img" />
              <span className="print-card-title">{item.title}</span>
              <span className="print-card-artist">{item.artist}</span>
              <span className="print-card-price">{formatMoney(item.price, currency)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 7. Bag Drawer */}
      <div
        className={`drawer-backdrop${drawerOpen ? ' open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`drawer${drawerOpen ? ' open' : ''}`}
        aria-label="Your bag"
        aria-hidden={!drawerOpen}
      >
        <div className="drawer-head">
          <h2 className="drawer-title">YOUR BAG</h2>
          <button
            type="button"
            className="drawer-close"
            aria-label="Close bag"
            onClick={() => setDrawerOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="drawer-body">
          {checkoutDone ? (
            <div className="drawer-confirmed">
              Thank you for collecting with Zestwell. Your archival Citrus Season order is being
              prepared for dispatch.
            </div>
          ) : bag.length === 0 ? (
            <div className="drawer-empty">YOUR BAG IS EMPTY</div>
          ) : (
            bag.map((item) => {
              const p = PRINTS[item.printIdx];
              const isEntering = enteringItemId === item.id;
              return (
                <div key={item.id} className={`drawer-item${isEntering ? ' entering' : ''}`}>
                  <CroppedPrint printIndex={item.printIdx} className="drawer-thumb" />
                  <div className="drawer-item-info">
                    <div className="drawer-item-title">{p.title}</div>
                    <div className="drawer-item-artist">{p.artist}</div>
                    <div className="drawer-item-meta">{item.size}</div>
                    <div className="drawer-item-controls">
                      <div className="drawer-qty">
                        <button
                          type="button"
                          className="drawer-qty-btn"
                          aria-label="Decrease quantity"
                          onClick={() => updateBagQty(item.id, -1)}
                        >
                          −
                        </button>
                        <span className="drawer-qty-val">{item.qty}</span>
                        <button
                          type="button"
                          className="drawer-qty-btn"
                          aria-label="Increase quantity"
                          onClick={() => updateBagQty(item.id, 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="drawer-trash"
                        aria-label={`Remove ${p.title}`}
                        onClick={() => removeBagItem(item.id)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="drawer-item-price">
                    {formatMoney(p.price * item.qty, currency, true)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="drawer-foot">
          <div className="drawer-subtotal">
            <span>Subtotal</span>
            <span className="drawer-subtotal-val">
              {formatMoney(bagSubtotalUsd, currency, true)}
            </span>
          </div>
          <button
            type="button"
            className="drawer-checkout"
            disabled={bag.length === 0}
            onClick={() => {
              setBag([]);
              setCheckoutDone(true);
            }}
          >
            CHECKOUT →
          </button>
        </div>
      </aside>

      {/* Utility Modal for Search / Info / Auctions / Help / Account / Saved */}
      {utilityModal && (
        <div
          className="utility-backdrop"
          onClick={() => setUtilityModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="utility-card" onClick={(e) => e.stopPropagation()}>
            <div className="utility-head">
              <h2 className="utility-title">
                {utilityModal === 'search' && 'Search Citrus Season'}
                {utilityModal === 'info' && 'Exhibition Info'}
                {utilityModal === 'auctions' && 'Seasonal Editions'}
                {utilityModal === 'help' && 'Shipping & Framing Help'}
                {utilityModal === 'account' && 'Collector Account'}
                {utilityModal === 'saved' && 'Saved Prints'}
              </h2>
              <button
                type="button"
                className="drawer-close"
                aria-label="Close modal"
                onClick={() => setUtilityModal(null)}
              >
                ×
              </button>
            </div>

            {utilityModal === 'search' && (
              <>
                <input
                  type="search"
                  className="search-input"
                  placeholder="Search by title or artist…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <div className="search-results">
                  {filteredSearchPrints.map((p) => (
                    <button
                      key={p.index}
                      type="button"
                      className="search-result-btn"
                      onClick={() => {
                        setUtilityModal(null);
                        openPrintPage(p.index, null, false);
                      }}
                    >
                      <CroppedPrint printIndex={p.index} className="search-result-thumb" />
                      <div>
                        <div className="print-card-title" style={{ marginTop: 0 }}>
                          {p.title}
                        </div>
                        <div className="print-card-artist">{p.artist}</div>
                      </div>
                    </button>
                  ))}
                  {filteredSearchPrints.length === 0 && (
                    <p className="page-desc" style={{ marginTop: 0 }}>
                      No prints match “{searchQuery}”.
                    </p>
                  )}
                </div>
              </>
            )}

            {utilityModal === 'info' && (
              <p className="page-desc" style={{ marginTop: 0 }}>
                Citrus Season brings together nine sun-washed gouache studies of tabletop fruit,
                striped ceramics, and afternoon light. Each edition is printed on archival matte
                paper to preserve the chalky warmth of flat gouache pigment.
              </p>
            )}

            {utilityModal === 'auctions' && (
              <p className="page-desc" style={{ marginTop: 0 }}>
                Original gouache studies from the Citrus Season series are offered quarterly in our
                collector salon. Signed &amp; numbered archival editions remain open throughout the
                season.
              </p>
            )}

            {utilityModal === 'help' && (
              <p className="page-desc" style={{ marginTop: 0 }}>
                Unframed prints ship rolled in rigid archival tubes within 3–5 working days. Framed
                pieces ship flat in custom-fitted cartons within 7–10 working days.
              </p>
            )}

            {utilityModal === 'account' && (
              <p className="page-desc" style={{ marginTop: 0 }}>
                Guest collector session · Currency: {currency} · Saved prints: {savedPrints.length}{' '}
                · Items in bag: {totalBagCount}.
              </p>
            )}

            {utilityModal === 'saved' && (
              <div className="search-results">
                {savedPrints.length === 0 ? (
                  <p className="page-desc" style={{ marginTop: 0 }}>
                    No saved prints yet. Bookmark any print from its product page to keep it here.
                  </p>
                ) : (
                  savedPrints.map((idx) => {
                    const p = PRINTS[idx];
                    return (
                      <button
                        key={p.index}
                        type="button"
                        className="search-result-btn"
                        onClick={() => {
                          setUtilityModal(null);
                          openPrintPage(p.index, null, false);
                        }}
                      >
                        <CroppedPrint printIndex={p.index} className="search-result-thumb" />
                        <div>
                          <div className="print-card-title" style={{ marginTop: 0 }}>
                            {p.title}
                          </div>
                          <div className="print-card-artist">{p.artist}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

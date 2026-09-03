import {
  SALON_QA_FIXTURE_LONG,
  SALON_QA_FIXTURE_MINIMAL,
  SALON_QA_FIXTURE_SHORT,
  deriveSalonSections,
  resolveSalonThemeTokens,
  validateSalonTemplateConfig,
  type SalonGalleryItem,
  type SalonTemplateConfig,
} from '@shalcon/template-runtime';
import { SALON_TEMPLATE_V1 } from '@shalcon/templates';
import { useEffect, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';

import './salon-template.css';

const fixtures = {
  long: SALON_QA_FIXTURE_LONG,
  short: SALON_QA_FIXTURE_SHORT,
  minimal: SALON_QA_FIXTURE_MINIMAL,
} as const;

function fixtureFromSearch(search: string): SalonTemplateConfig {
  const requested = new URLSearchParams(search).get('fixture');
  if (requested === 'short') return fixtures.short;
  if (requested === 'minimal') return fixtures.minimal;
  return fixtures.long;
}

function GalleryVisual({ item, index }: { item: SalonGalleryItem; index: number }) {
  return (
    <figure className={`salon-gallery-item salon-tone-${item.tone}`}>
      <div className="salon-visual-field" aria-hidden="true">
        <span className="salon-orbit salon-orbit-a" />
        <span className="salon-orbit salon-orbit-b" />
        <span className="salon-visual-number">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <figcaption>{item.label}</figcaption>
    </figure>
  );
}

function ContactSection({ config }: { config: SalonTemplateConfig }) {
  if (!config.contact) {
    return (
      <section className="salon-contact salon-contact-fallback" id="visit" aria-labelledby="visit-title">
        <p className="salon-kicker">Visit</p>
        <h2 id="visit-title">Ready when the verified details are.</h2>
        <p>
          Contact information is intentionally withheld in this fixture. The live demo only shows
          details backed by stored prospect evidence.
        </p>
        <span className="salon-button salon-button-muted">Verified contact required</span>
      </section>
    );
  }

  return (
    <section className="salon-contact" id="visit" aria-labelledby="visit-title">
      <div>
        <p className="salon-kicker">Visit</p>
        <h2 id="visit-title">Make space for the appointment.</h2>
      </div>
      <div className="salon-contact-grid">
        <div className="salon-contact-detail">
          <span>Studio</span>
          <strong>{config.business.name}</strong>
          {config.business.city ? <small>{config.business.city}</small> : null}
        </div>
        {config.contact.address ? (
          <div className="salon-contact-detail">
            <span>Address</span>
            <strong>{config.contact.address}</strong>
          </div>
        ) : null}
        {config.contact.hours && config.contact.hours.length > 0 ? (
          <div className="salon-contact-detail">
            <span>Hours</span>
            {config.contact.hours.map((hours) => (
              <strong key={hours}>{hours}</strong>
            ))}
          </div>
        ) : null}
      </div>
      <div className="salon-contact-action">
        {config.contact.phone ? (
          <a className="salon-button" href={`tel:${config.contact.phone.replaceAll(' ', '')}`}>
            {config.contact.ctaLabel ?? 'Call the studio'}
          </a>
        ) : (
          <a className="salon-button" href="#services">
            {config.contact.ctaLabel ?? 'Explore services'}
          </a>
        )}
        <small>Fixture action · replace with verified booking/contact destination</small>
      </div>
    </section>
  );
}

export function SalonTemplatePreview() {
  const location = useLocation();
  const config = fixtureFromSearch(location.search);
  const validation = validateSalonTemplateConfig(config);
  const sections = deriveSalonSections(config);
  const style = resolveSalonThemeTokens(config.theme) as CSSProperties;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${config.business.name} — Shalcon concept preview`;

    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const meta = existing ?? document.createElement('meta');
    const previousContent = existing?.content;
    if (!existing) {
      meta.name = 'robots';
      document.head.append(meta);
    }
    meta.content = config.noindex ? 'noindex,nofollow,noarchive' : 'index,follow';

    return () => {
      document.title = previousTitle;
      if (!existing) meta.remove();
      else if (previousContent !== undefined) existing.content = previousContent;
    };
  }, [config.business.name, config.noindex]);

  if (!validation.ok) {
    return (
      <main className="salon-invalid" role="alert">
        <h1>Template fixture rejected</h1>
        <p>{validation.errors.join(' · ')}</p>
      </main>
    );
  }

  const hasServices = sections.includes('services');
  const hasStory = sections.includes('story');
  const hasGallery = sections.includes('gallery');

  return (
    <div
      className={`salon-site salon-hero-${config.theme.heroVariant} salon-images-${config.theme.imageTreatment} salon-motion-${config.theme.motionPreset}`}
      style={style}
      data-template-id={SALON_TEMPLATE_V1.id}
      data-template-version={SALON_TEMPLATE_V1.version}
    >
      <aside className="salon-concept-bar" aria-label="Concept disclosure">
        <span>{config.fixtureLabel ?? 'Concept preview'}</span>
        <strong>SHALCON / TEMPLATE 01</strong>
      </aside>

      <header className="salon-header">
        <a className="salon-wordmark" href="#top" aria-label={`${config.business.name} home`}>
          {config.business.name}
        </a>
        <nav aria-label="Salon preview navigation">
          <a href="#services">Services</a>
          {hasStory ? <a href="#story">Philosophy</a> : null}
          {hasGallery ? <a href="#gallery">Studies</a> : null}
          <a href="#visit">Visit</a>
        </nav>
        <span className="salon-template-chip">v{SALON_TEMPLATE_V1.version}</span>
      </header>

      <main id="top">
        <section className="salon-hero" aria-labelledby="salon-hero-title">
          <div className="salon-hero-copy">
            <p className="salon-kicker">
              {config.hero.eyebrow ?? config.business.descriptor ?? 'Salon & beauty concept'}
            </p>
            <h1 id="salon-hero-title">{config.hero.headline}</h1>
            {config.hero.subhead ? <p className="salon-hero-lede">{config.hero.subhead}</p> : null}
            <div className="salon-hero-action-row">
              <a className="salon-button salon-button-light" href="#visit">
                {config.hero.primaryCtaLabel ?? 'Plan a visit'}
              </a>
              <span>{config.business.city ?? 'Location shown when verified'}</span>
            </div>
          </div>

          <div className="salon-hero-art" aria-label="Abstract editorial visual study">
            <div className="salon-hero-frame salon-hero-frame-main">
              <div className="salon-silhouette" aria-hidden="true">
                <span className="salon-silhouette-head" />
                <span className="salon-silhouette-neck" />
                <span className="salon-silhouette-shoulder" />
              </div>
              <span className="salon-frame-caption">Form / light / texture</span>
            </div>
            <div className="salon-hero-frame salon-hero-frame-detail" aria-hidden="true">
              <span className="salon-detail-arc" />
              <span className="salon-detail-line" />
            </div>
            <span className="salon-vertical-note">SHALCON CONCEPT · NOINDEX</span>
          </div>
        </section>

        <section className="salon-marquee" aria-label="Template values">
          <div>
            <span>Shape</span>
            <i>✦</i>
            <span>Tone</span>
            <i>✦</i>
            <span>Texture</span>
            <i>✦</i>
            <span>Attention</span>
          </div>
        </section>

        <section className="salon-services" id="services" aria-labelledby="services-title">
          <div className="salon-section-intro">
            <p className="salon-kicker">Services</p>
            <h2 id="services-title">A menu that reads like a point of view.</h2>
          </div>

          {hasServices ? (
            <div className="salon-service-list">
              {config.services?.map((service, index) => (
                <article className="salon-service-row" key={`${service.name}-${index}`}>
                  <span className="salon-service-index">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{service.name}</h3>
                  <p>{service.description ?? 'Details available during consultation.'}</p>
                  <strong>{service.priceLabel ?? 'Ask for details'}</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="salon-safe-fallback">
              <span>Verified service list pending</span>
              <p>
                The layout stays intentional without inventing treatments, prices, staff, or brand
                claims. Verified services can drop into this section later.
              </p>
            </div>
          )}
        </section>

        {hasStory && config.story ? (
          <section className="salon-story" id="story" aria-labelledby="story-title">
            <div className="salon-story-index">02</div>
            <div className="salon-story-copy">
              <p className="salon-kicker">{config.story.kicker ?? 'Point of view'}</p>
              <h2 id="story-title">{config.story.headline}</h2>
              {config.story.body ? <p>{config.story.body}</p> : null}
            </div>
            <div className="salon-story-mark" aria-hidden="true">
              <span>A</span>
              <span>&</span>
              <span>A</span>
            </div>
          </section>
        ) : null}

        {hasGallery && config.gallery ? (
          <section className="salon-gallery" id="gallery" aria-labelledby="gallery-title">
            <div className="salon-section-intro salon-section-intro-wide">
              <p className="salon-kicker">Studies</p>
              <h2 id="gallery-title">A visual system before real photography arrives.</h2>
              <p>
                Internal abstract panels keep the template art-directed without depending on stock
                imagery or pretending fixture visuals belong to a prospect.
              </p>
            </div>
            <div className="salon-gallery-grid">
              {config.gallery.map((item, index) => (
                <GalleryVisual item={item} index={index} key={`${item.label}-${index}`} />
              ))}
            </div>
          </section>
        ) : null}

        <ContactSection config={config} />
      </main>

      <footer className="salon-footer">
        <div>
          <strong>{config.business.name}</strong>
          <span>{config.business.descriptor ?? 'Salon & beauty concept'}</span>
        </div>
        <p>{config.disclosure.text}</p>
        <small>
          Template {SALON_TEMPLATE_V1.id} · v{SALON_TEMPLATE_V1.version} · noindex:{' '}
          {config.noindex ? 'on' : 'off'}
        </small>
      </footer>
    </div>
  );
}

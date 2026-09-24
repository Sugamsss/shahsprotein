import React from 'react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { siteConfig } from '../../data/siteConfig';
import { useScrollReveal } from '../../hooks/useScrollReveal';

export const StorySection: React.FC = () => {
  const leftRef = useScrollReveal<HTMLDivElement>();
  const rightRef = useScrollReveal<HTMLDivElement>();

  return (
    <section
      id="our-story"
      className="snap-section story-section"
      aria-label="Our Story"
    >
      <Container>
        <div className="story-grid">
          {/* Story Text */}
          <div ref={leftRef} className="reveal reveal-left-far reveal-story-slow">
            <Badge className="story-eyebrow">OUR STORY</Badge>

            <h2 className="story-title">
              {siteConfig.story.heading}
            </h2>

            <div className="story-body">
              {siteConfig.story.paragraphs.map((paragraph, index) => (
                <p key={index}>
                  {paragraph.map((segment, segmentIndex) => (
                    segment.highlight ? (
                      <span key={`${segment.text}-${segmentIndex}`} className="story-highlight">
                        {segment.text}
                      </span>
                    ) : segment.text
                  ))}
                </p>
              ))}
            </div>
          </div>

          {/* Story Visual */}
          <div ref={rightRef} className="story-visual reveal reveal-right-far reveal-story-slow delay-200">
            <Card className="story-photo">
              <img
                src="/assets/story-family-approved-1200w.webp"
                srcSet="/assets/story-family-approved-800w.webp 800w, /assets/story-family-approved-1200w.webp 1200w, /assets/story-family-approved-1672w.webp 1672w"
                sizes="(min-width: 1200px) 500px, (min-width: 901px) 40vw, (min-width: 601px) 544px, calc(100vw - 66px)"
                alt="The Shah family working together on Shah's Nutrition"
                width={1672}
                height={941}
                loading="lazy"
                decoding="async"
                // Fixed ratio in CSS: the smaller srcset files round to a hair-different ratio, which would nudge the layout.
                className="story-photo__img"
              />
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
};

/* Website admin navigation mapped from Shifat Tales teacher-sidebar reference.
 * Routes open existing secured CMS editor; partial markers mean missing dedicated schemas. */
import {CMS_FORMS,formForTarget} from './cms-fields.mjs';
export const WEBSITE_MENU = Object.freeze([
  {
    "title": "Website Overview",
    "items": [
      {
        "id": "website-overview-all-published-pages",
        "label": "All published pages",
        "slug": "home",
        "kind": null,
        "match": null,
        "parity": "full",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Home Page",
    "items": [
      {
        "id": "home-page-hero",
        "label": "Hero",
        "slug": "home",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-hero-stats",
        "label": "Hero Stats",
        "slug": "home",
        "kind": "cards",
        "match": "A thoughtful way",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-offered-batches",
        "label": "Offered Batches",
        "slug": "home",
        "kind": "courses",
        "match": "Discover the learning paths",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-why-learn-section",
        "label": "Why Learn Section",
        "slug": "about",
        "kind": "cards",
        "match": "What matters",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-meet-teacher-section",
        "label": "Meet Teacher Section",
        "slug": "about",
        "kind": "rich-text",
        "match": "Meet Teacher",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-celebrating-excellence",
        "label": "Celebrating Excellence",
        "slug": "results",
        "kind": "results",
        "match": "Achievement board",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-student-success-stories",
        "label": "Student Success Stories",
        "slug": "results",
        "kind": "results",
        "match": "Student Success",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-concept-breakdown-theater",
        "label": "Concept Breakdown Theater",
        "slug": "home",
        "kind": null,
        "match": "Video",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-testimonials",
        "label": "Testimonials",
        "slug": "reviews",
        "kind": "reviews",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-news-events",
        "label": "News & Events",
        "slug": "news-events",
        "kind": "news",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "home-page-captured-moments",
        "label": "Captured Moments",
        "slug": "gallery",
        "kind": "gallery",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "About Page",
    "items": [
      {
        "id": "about-page-about-hero",
        "label": "About Hero",
        "slug": "about",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-summary-metrics-strip",
        "label": "Summary Metrics Strip",
        "slug": "about",
        "kind": "cards",
        "match": "Metrics",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-education-timeline",
        "label": "Education Timeline",
        "slug": "about",
        "kind": "rich-text",
        "match": "Education",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-research-experience",
        "label": "Research Experience",
        "slug": "about",
        "kind": "rich-text",
        "match": "Research Experience",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-research-publications",
        "label": "Research Publications",
        "slug": "about",
        "kind": "rich-text",
        "match": "Publications",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-industrial-training-banner",
        "label": "Industrial Training Banner",
        "slug": "about",
        "kind": "cards",
        "match": "Industrial Training",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-projects-grid",
        "label": "Projects Grid",
        "slug": "projects",
        "kind": "cards",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-technical-skills",
        "label": "Technical Skills",
        "slug": "about",
        "kind": "cards",
        "match": "Skills",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "about-page-extra-curricular-activities",
        "label": "Extra Curricular Activities",
        "slug": "about",
        "kind": "cards",
        "match": "Curricular",
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Courses Page",
    "items": [
      {
        "id": "courses-page-hero-section",
        "label": "Hero Section",
        "slug": "courses",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "courses-page-card-system",
        "label": "Card System",
        "slug": "courses",
        "kind": "courses",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Gallery Page",
    "items": [
      {
        "id": "gallery-page-hero-section",
        "label": "Hero Section",
        "slug": "gallery",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "gallery-page-photo-albums",
        "label": "Photo Albums",
        "slug": "gallery",
        "kind": "gallery",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Results Page",
    "items": [
      {
        "id": "results-page-hero-section",
        "label": "Hero Section",
        "slug": "results",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "results-page-student-cards",
        "label": "Student Cards",
        "slug": "results",
        "kind": "results",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Materials Page",
    "items": [
      {
        "id": "materials-page-hero-section",
        "label": "Hero Section",
        "slug": "materials",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "materials-page-categories",
        "label": "Categories",
        "slug": "materials",
        "kind": "materials",
        "match": "Categories",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "materials-page-manage-materials",
        "label": "Manage Materials",
        "slug": "materials",
        "kind": "materials",
        "match": "Resources",
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Academic Calendar",
    "items": [
      {
        "id": "academic-calendar-overview",
        "label": "Overview",
        "slug": "academic-calendar",
        "kind": null,
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "academic-calendar-hero-banner",
        "label": "Hero Banner",
        "slug": "academic-calendar",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "academic-calendar-schedule-flyer",
        "label": "Schedule Flyer",
        "slug": "academic-calendar",
        "kind": "academic-calendar",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Class Routine",
    "items": [
      {
        "id": "class-routine-overview",
        "label": "Overview",
        "slug": "class-routine",
        "kind": null,
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "class-routine-hero-banner",
        "label": "Hero Banner",
        "slug": "class-routine",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "class-routine-routine-flyer",
        "label": "Routine Flyer",
        "slug": "class-routine",
        "kind": "routine",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "News & Events",
    "items": [
      {
        "id": "news-and-events-hero-banner",
        "label": "Hero Banner",
        "slug": "news-events",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "news-and-events-categories",
        "label": "Categories",
        "slug": "news-events",
        "kind": "news",
        "match": "Categories",
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "news-and-events-cards-body",
        "label": "Cards & Body",
        "slug": "news-events",
        "kind": "news",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Reviews Page",
    "items": [
      {
        "id": "reviews-page-hero-section",
        "label": "Hero Section",
        "slug": "reviews",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "reviews-page-manage-reviews",
        "label": "Manage Reviews",
        "slug": "reviews",
        "kind": "reviews",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Contact Page",
    "items": [
      {
        "id": "contact-page-hero-section",
        "label": "Hero Section",
        "slug": "contact",
        "kind": "hero",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "contact-page-contact-info-map",
        "label": "Contact Info & Map",
        "slug": "contact",
        "kind": "contact",
        "match": null,
        "parity": "partial",
        "tab": "content"
      },
      {
        "id": "contact-page-faq-section",
        "label": "FAQ Section",
        "slug": "contact",
        "kind": "faq",
        "match": null,
        "parity": "partial",
        "tab": "content"
      }
    ]
  },
  {
    "title": "Global",
    "items": [
      {
        "id": "global-global-settings",
        "label": "Global Settings",
        "slug": null,
        "kind": null,
        "match": null,
        "parity": "full",
        "tab": "settings"
      },
      {
        "id": "global-global-footer",
        "label": "Global Footer",
        "slug": null,
        "kind": null,
        "match": null,
        "parity": "partial",
        "tab": "settings"
      },
      {
        "id": "global-media-library",
        "label": "Media Library",
        "slug": null,
        "kind": null,
        "match": null,
        "parity": "full",
        "tab": "media"
      }
    ]
  }
]);
export const getWebsiteTarget = id => {
 const entry=WEBSITE_MENU.flatMap(g=>g.items).find(e=>e.id===id);
 if(!entry)return null;
 const schemaKey=id==='global-global-footer'?'GLOBAL_FOOTER':formForTarget(entry);
 const form=CMS_FORMS[schemaKey];
 return {...entry,schemaKey,...(form?{kind:form.kind}:{}),...(id.startsWith('home-page-')?{slug:'home'}:{}),...(id==='global-global-footer'?{slug:'home',tab:'content'}:{})};
};

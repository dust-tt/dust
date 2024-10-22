import "node-zendesk";

interface Brand {
  url: string;
  id: number;
  name: string;
  brand_url: string;
  subdomain: string;
  host_mapping: string | null;
  has_help_center: boolean;
  help_center_state: string;
  active: boolean;
  default: boolean;
  is_deleted: boolean;
  logo: object | null;
  ticket_form_ids: number[];
  signature_template: string;
  created_at: string;
  updated_at: string;
}

interface Response {
  status: number;
  headers: object;
  statusText: string;
}

interface Category {
  id: number;
  url: string;
  html_url: string;
  position: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  locale: string;
  source_locale: string;
  outdated: boolean;
}

interface Article {
  id: number;
  url: string;
  html_url: string;
  author_id: number;
  comments_disabled: boolean;
  draft: boolean;
  promoted: boolean;
  position: number;
  vote_sum: number;
  vote_count: number;
  section_id: number;
  created_at: string;
  updated_at: string;
  name: string;
  title: string;
  source_locale: string;
  locale: string;
  outdated: boolean;
  outdated_locales: string[];
  edited_at: string;
  user_segment_id: number;
  permission_group_id: number;
  content_tag_ids: number[];
  label_names: string[];
  body: string;
  user_segment_ids: number[];
}

declare module "node-zendesk" {
  interface Client {
    brand: {
      list: () => Promise<{
        response: Response;
        result: Brand[];
      }>;
      show: (
        brandId: number
      ) => Promise<{ response: Response; result: { brand: Brand } }>;
    };
    helpcenter: {
      categories: {
        list: () => Promise<Category[]>;
        show: (
          categoryId: number
        ) => Promise<{ response: Response; result: Category }>;
      };
      articles: {
        list: () => Promise<Article[]>;
        show: (
          articleId: number
        ) => Promise<{ response: Response; result: Article }>;
        listByCategory: (categoryId: number) => Promise<Article[]>;
        listSinceStartTime: (startTime: number) => Promise<Article[]>;
      };
    };
  }

  export function createClient(options: object): Client;
}

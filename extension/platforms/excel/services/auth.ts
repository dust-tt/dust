import type { CellInfo } from "@app/types/cell";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import type {
  LoginResult,
  StoredTokens,
} from "@extension/shared/services/auth";
import { AuthError, AuthService } from "@extension/shared/services/auth";
import type { StorageService } from "@extension/shared/services/storage";

const NOT_AVAILABLE_MESSAGE = "Sign-in is not available yet in Excel.";

export class ExcelAuthService extends AuthService {
  constructor(storage: StorageService, cells?: CellInfo[]) {
    super(storage, cells);
  }

  override async getStoredTokens(): Promise<StoredTokens | null> {
    return null;
  }

  async login(): Promise<Result<LoginResult, AuthError>> {
    return new Err(new AuthError("not_authenticated", NOT_AVAILABLE_MESSAGE));
  }

  async logout(): Promise<boolean> {
    return true;
  }

  async getAccessToken(): Promise<string | null> {
    return null;
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    return new Err(new AuthError("not_authenticated", NOT_AVAILABLE_MESSAGE));
  }
}

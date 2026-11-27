from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.users import USERNAME_RE

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=30)
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=72)  # Supabase hashes with bcrypt, which ignores bytes past 72

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip().lower()
        if not USERNAME_RE.fullmatch(v):
            raise ValueError("Username must be 3-30 characters: letters, numbers, dots and underscores.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identifier: str = Field(min_length=1, max_length=254)  # username or email
    password: str = Field(min_length=1, max_length=72)
    remember: bool = False

class _EmailOnly(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class ResendCodeRequest(_EmailOnly):
    pass


class ForgotPasswordRequest(_EmailOnly):
    pass


class VerifyEmailRequest(_EmailOnly):
    code: str = Field(pattern=r"^\s*\d{6}\s*$")


class ResetPasswordRequest(VerifyEmailRequest):
    newPassword: str = Field(min_length=8, max_length=72)

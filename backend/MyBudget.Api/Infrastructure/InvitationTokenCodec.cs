using System.Security.Cryptography;
using System.Text;

namespace MyBudget.Api.Infrastructure;

public interface IInvitationTokenCodec
{
    string GenerateToken();
    string ComputeHash(string token);
}

public class InvitationTokenCodec : IInvitationTokenCodec
{
    public string GenerateToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public string ComputeHash(string token)
    {
        var normalized = token.Trim();
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(hash);
    }
}
